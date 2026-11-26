import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// ※ 2026-11-26：Android アプリ（Firebase）の宛先（fcm:…）を、GAS ハブ経由で送る処理を追加。ほかは今までどおり。
//   hub_url / hub_secret が private.push_config に無いときは、Android への送信だけ何もしない。
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const isFcm = (endpoint: unknown) => String(endpoint || "").startsWith("fcm:");
const fcmIds = (endpoint: string) => { const p = String(endpoint).split(":"); return { device: p[1] || "", u8: p[2] || "" }; };
async function hubSend(cfg: Record<string, string>, items: Record<string, unknown>[]) {
  if (!items.length || !cfg.hub_url || !cfg.hub_secret) return 0;
  try {
    const r = await fetch(cfg.hub_url, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "push", op: "send", secret: cfg.hub_secret, items }), signal: AbortSignal.timeout(9000),
    });
    const j = await r.json().catch(() => ({}));
    return Number(j && j.sent) || 0;
  } catch (e) { console.error("hub push failed", String(e).slice(0, 100)); return 0; }
}

function preview(content: string): string {
  try {
    const p = JSON.parse(content);
    if (p && typeof p === "object" && p.type) {
      switch (p.type) {
        case "text": return String(p.text || "").slice(0, 80);
        case "image": return "📷 画像";
        case "video": return "🎬 動画";
        case "audio": return "🎤 ボイス";
        case "file": return "📎 " + String(p.name || "ファイル").slice(0, 40);
        case "poll": return "📊 アンケート";
        case "location": return "📍 位置情報";
        case "game": return "🎮 対戦";
        default: return "新しいメッセージ";
      }
    }
  } catch (_e) { /* plain text */ }
  return String(content || "").slice(0, 80);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok");
  try {
    const cfgRes = await sb.rpc("push_config");
    const cfg = (cfgRes.data || {}) as Record<string, string>;
    if (!cfg.push_secret || req.headers.get("x-push-secret") !== cfg.push_secret) {
      return new Response("forbidden", { status: 403 });
    }
    const { message_id } = await req.json();
    if (!message_id) return new Response("bad", { status: 400 });
    const t = await sb.rpc("push_targets", { p_message: message_id });
    const d = (t.data || {}) as any;
    const subs: any[] = d.subs || [];
    if (!subs.length) return new Response("none");
    const webSubs = subs.filter((s) => !isFcm(s.endpoint));
    const fcmSubs = subs.filter((s) => isFcm(s.endpoint));
    webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);
    const title = d.room ? `${d.room}（${d.sender || "だれか"}）` : (d.sender || "ARE");
    const gone: string[] = [];
    let failed = 0;
    await Promise.all(webSubs.map(async (s) => {
      const body = s.show_body ? preview(d.content) : "新しいメッセージがあります";
      const payload = JSON.stringify({ title: s.show_body ? title : "ARE", body, room: d.room_id, tag: "room-" + d.room_id });
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: "high" });
      } catch (e: any) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) gone.push(s.endpoint);
        else { failed++; console.error("push failed", e && e.statusCode, String(e && e.body || "").slice(0, 160)); }
      }
    }));
    // Android アプリ（Firebase）：GAS ハブへ、まとめて頼む
    const fcmSent = await hubSend(cfg, fcmSubs.map((s) => ({
      ...fcmIds(s.endpoint), type: "msg", title: s.show_body ? title : "ARE",
      body: s.show_body ? preview(d.content) : "新しいメッセージがあります", room: d.room_id, tag: "room-" + d.room_id, silent: false,
    })));
    if (gone.length) await sb.from("push_subscriptions").delete().in("endpoint", gone);
    return new Response("sent " + (webSubs.length - gone.length - failed + fcmSent) + (failed ? " failed " + failed : "") + (gone.length ? " removed " + gone.length : ""));
  } catch (e) {
    console.error("send-push error", String(e));
    return new Response("error", { status: 500 });
  }
});
