import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// 毎朝7時（日本時間）の「おはようございます」プッシュ。cron から x-cleanup-secret つきで呼ばれる。
// 送り先は push_morning_targets()（管理者・家庭の人・おやすみ時間中の人を除く）
// ※ 2026-11-26：Android アプリ（Firebase）の宛先（fcm:…）を、GAS ハブ経由で送る処理を追加。ほかは今までどおり。
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const envSecret = Deno.env.get("STORY_CLEANUP_SECRET") || "";

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

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const given = req.headers.get("x-cleanup-secret") || "";
  let allowed = !!envSecret && given === envSecret;
  if (!allowed && given) { const m = await sb.rpc("cleanup_secret_matches", { p: given }); allowed = m.data === true; }
  if (!allowed) return new Response("forbidden", { status: 403 });
  try {
    const cfgRes = await sb.rpc("push_config");
    const cfg = (cfgRes.data || {}) as Record<string, string>;
    if (!cfg.vapid_public || !cfg.vapid_private) return new Response("no vapid", { status: 500 });
    const t = await sb.rpc("push_morning_targets");
    const subs: any[] = Array.isArray(t.data) ? t.data : [];
    if (!subs.length) return new Response("none");
    webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);
    const gone: string[] = [];
    let sent = 0;
    const bodyOf = (s: any) => {
      const unread = Number(s.unread) || 0;
      return unread > 0 ? `未読のメッセージが ${unread} 件あります。今日も いちにち よろしくね。` : "今日も ARE で、いいいちにちを！";
    };
    await Promise.all(subs.filter((s) => !isFcm(s.endpoint)).map(async (s) => {
      const payload = JSON.stringify({ type: "morning", title: "☀️ おはようございます", body: bodyOf(s), tag: "morning-alarm" });
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 10800, urgency: "high" });
        sent++;
      } catch (e: any) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) gone.push(s.endpoint);
      }
    }));
    sent += await hubSend(cfg, subs.filter((s) => isFcm(s.endpoint)).map((s) => ({
      ...fcmIds(s.endpoint), type: "morning", title: "☀️ おはようございます", body: bodyOf(s), tag: "morning-alarm", silent: false,
    })));
    if (gone.length) await sb.from("push_subscriptions").delete().in("endpoint", gone);
    return new Response("sent " + sent);
  } catch (_e) {
    return new Response("error", { status: 500 });
  }
});
