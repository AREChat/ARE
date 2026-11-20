import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// 30日たったチャットの「ファイル」を、Google ドライブの「ファイル保存フォルダ」に移す。
//  1) DB から「30日たったファイル」を受け取る（file_archive_candidates_v1）
//  2) Google ドライブの受け口（GAS）に、保存を頼む（ファイルは、10分だけ有効の署名つきURLで GAS が取りにいく）
//  3) ドライブに保存できたときだけ：メッセージを「移しました」の表示に書きかえ（file_archive_done_v1）、保存先のファイルを削除する
//  ※ 保存できなかったときは、何も消さない。あとの回でやり直す（5回失敗したら止めて、記録に残す）
// 呼び出すのは pg_cron（毎時41分）だけ。合言葉はストーリー掃除（cleanup-stories）と同じ。
//
// 必要な設定（Supabase の Edge Functions → Secrets。値は docs/file-archive.md の手順で作る）：
//   DRIVE_ARCHIVE_URL   … GAS のウェブアプリの URL（https://script.google.com/macros/s/…/exec）
//   DRIVE_ARCHIVE_TOKEN … GAS の ARCHIVE_TOKEN と同じ、長いランダムな文字列
// この2つが無いときは、何もしない（ファイルは今までどおり残る）。

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cleanupSecret = Deno.env.get("STORY_CLEANUP_SECRET") || "";
const driveUrl = Deno.env.get("DRIVE_ARCHIVE_URL") || "";
const driveToken = Deno.env.get("DRIVE_ARCHIVE_TOKEN") || "";
const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const BUCKET = "chat-attachments";
const ALLOWED_TYPES = ["file"];            // いまは「ファイル」だけ（画像・動画・ボイスは、アルバムなどの表示も直してから）
const TIME_BUDGET_MS = 100_000;            // 1回の呼び出しで使う時間（Edge Function の上限より短くする）

function jstParts(iso: string) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
    const g = (t: string) => parts.find((p) => p.type === t)?.value || "00";
    return { ymd: g("year") + g("month") + g("day"), hm: g("hour") + g("minute"), month: g("year") + "-" + g("month") };
}

function cleanName(s: string): string {
    return String(s || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 100) || "file";
}

// ドライブでの名前： 20261101-1230_送った人_元の名前[メッセージID先頭8文字].拡張子
function driveFileName(row: any): string {
    const t = jstParts(row.created_at);
    const original = cleanName(row.file_name || "file");
    const dot = original.lastIndexOf(".");
    const base = dot > 0 ? original.slice(0, dot) : original, ext = dot > 0 ? original.slice(dot) : "";
    const sender = cleanName(row.sender_name || "").slice(0, 30);
    return (t.ymd + "-" + t.hm + "_" + (sender ? sender + "_" : "") + base + "[" + String(row.message_id).slice(0, 8) + "]" + ext).slice(0, 180);
}

async function authorized(request: Request): Promise<boolean> {
    const given = request.headers.get("x-cleanup-secret") || "";
    if (!given) return false;
    if (cleanupSecret && given === cleanupSecret) return true;
    const matched = await adminClient.rpc("cleanup_secret_matches", { p: given });
    return matched.data === true;
}

Deno.serve(async (request: Request) => {
    if (request.method !== "POST") return new Response("POST only", { status: 405 });
    if (!(await authorized(request))) return new Response("forbidden", { status: 403 });

    let body: any = {};
    try { body = await request.json(); } catch (_e) { body = {}; }
    const days = Math.max(0, Math.min(3650, Number.isFinite(Number(body.days)) ? Number(body.days) : 30));
    const limit = Math.max(1, Math.min(20, Number.isFinite(Number(body.limit)) ? Number(body.limit) : 5));
    const types = (Array.isArray(body.types) ? body.types : ALLOWED_TYPES).filter((t: string) => ALLOWED_TYPES.includes(t));
    const dry = body.dry === true;
    if (!types.length) return Response.json({ error: "対象の種類が正しくありません。" }, { status: 400 });

    // 保存先（Google ドライブ）の設定がないときは、何もしない＝ファイルは消えない
    if (!driveUrl || !driveToken) {
        return Response.json({ configured: false, note: "DRIVE_ARCHIVE_URL と DRIVE_ARCHIVE_TOKEN が未設定のため、何もしませんでした（ファイルは残っています）。" });
    }

    const list = await adminClient.rpc("file_archive_candidates_v1", { p_days: days, p_limit: limit, p_types: types });
    if (list.error) {
        console.error("candidates failed:", list.error.code);
        return Response.json({ error: "30日たったファイルを確認できませんでした（SQL がまだ入っていない可能性があります）。" }, { status: 500 });
    }
    const rows: any[] = list.data || [];
    if (dry) {
        return Response.json({ configured: true, dry: true, days, found: rows.length, files: rows.map((r) => ({ message_id: r.message_id, name: r.file_name, size: r.size_bytes, created_at: r.created_at })) });
    }

    const started = Date.now();
    const results: any[] = [];
    for (const row of rows) {
        if (Date.now() - started > TIME_BUDGET_MS) break;
        const name = driveFileName(row);
        try {
            const signed = await adminClient.storage.from(BUCKET).createSignedUrl(row.object_path, 600);
            if (signed.error || !signed.data?.signedUrl) throw new Error("署名つきURLを作れません");

            const response = await fetch(driveUrl, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },   // GAS は text/plain で受けるのがいちばん確実
                body: JSON.stringify({ token: driveToken, url: signed.data.signedUrl, name, month: jstParts(row.created_at).month, mime: row.mime_type || "" }),
                redirect: "follow",
                signal: AbortSignal.timeout(Math.max(10_000, TIME_BUDGET_MS - (Date.now() - started))),
            });
            const text = await response.text();
            let answer: any = null;
            try { answer = JSON.parse(text); } catch (_e) { answer = null; }
            if (!response.ok || !answer || answer.ok !== true) {
                throw new Error("ドライブの保存に失敗: " + String((answer && answer.error) || ("HTTP " + response.status)).slice(0, 120));
            }

            // ドライブに保存できた → メッセージを書きかえ → 保存先から削除（この順番。DB が先）
            const done = await adminClient.rpc("file_archive_done_v1", { p_message: row.message_id, p_drive_name: name });
            if (done.error) throw new Error("ドライブには保存したが、チャットの更新に失敗");
            const removed = await adminClient.storage.from(BUCKET).remove([row.object_path]);
            results.push({ name, ok: true, messages: done.data, removed: !removed.error });
            if (removed.error) console.error("remove failed:", row.object_path.slice(0, 20));
        } catch (error) {
            const message = error instanceof Error ? error.message : "不明なエラー";
            await adminClient.rpc("file_archive_failed_v1", { p_message: row.message_id, p_error: message });
            results.push({ name, ok: false, error: message });
        }
    }
    return Response.json({ configured: true, days, found: rows.length, moved: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results });
});
