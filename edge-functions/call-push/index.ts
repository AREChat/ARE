import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// ※ 2026-11-26：Android アプリ（Firebase）の宛先（fcm:…）には、GAS ハブ経由で「着信」を送る。ほかは今までどおり。
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ ok: false }, 405);
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const who = await sb.auth.getUser(token);
    const uid = who.data?.user?.id;
    if (!uid) return json({ ok: false, error: "auth" }, 401);
    const body = await req.json().catch(() => ({}));
    const cancel = body.cancel === true;
    // 自分あてのテスト送信：通知の道すじ（サーバー → 各端末）がちゃんと通るかを、端末ごとに確かめる
    if (body.test === true) {
      const own = await sb.from("push_subscriptions").select("endpoint,p256dh,auth,ua").eq("user_id", uid);
      const rows: any[] = own.data || [];
      if (!rows.length) return json({ ok: true, devices: [] });
      const cfg0 = ((await sb.rpc("push_config")).data || {}) as Record<string, string>;
      webpush.setVapidDetails(cfg0.vapid_subject, cfg0.vapid_public, cfg0.vapid_private);
      const gone0: string[] = [];
      const devices = await Promise.all(rows.map(async (r) => {
        if (isFcm(r.endpoint)) {   // Android アプリ：GAS ハブ経由
          const n = await hubSend(cfg0, [{ ...fcmIds(r.endpoint), type: "msg", title: "ARE テスト通知", body: "サーバーから届きました。これが見えれば、この端末の通知はOKです。", tag: "are-test", room: "" }]);
          return { kind: "Androidアプリ", ok: n > 0, status: n > 0 ? 200 : 0 };
        }
        const ua = String(r.ua || "");
        const kind = /iPhone|iPad|iPod/i.test(ua) ? "iPhone/iPad" : /Android/i.test(ua) ? "Android" : /Windows|Macintosh|Linux/i.test(ua) ? "パソコン" : "不明";
        try {
          await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
            JSON.stringify({ title: "ARE テスト通知", body: "サーバーから届きました。これが見えれば、この端末の通知はOKです。", tag: "are-test", room: "" }), { TTL: 120, urgency: "high" });
          return { kind, ok: true, status: 201 };
        } catch (e: any) {
          const status = Number(e && e.statusCode) || 0;
          if (status === 404 || status === 410) gone0.push(r.endpoint);
          console.error("test push failed", kind, status, String(e && e.body || "").slice(0, 120));
          return { kind, ok: false, status, removed: status === 404 || status === 410 };
        }
      }));
      if (gone0.length) await sb.from("push_subscriptions").delete().in("endpoint", gone0);
      return json({ ok: true, devices });
    }
    const room = String(body.room_id || "");
    if (!UUID.test(room)) return json({ ok: false, error: "room" }, 400);
    const video = body.kind === "video";
    const t = await sb.rpc("call_push_targets", { p_room: room, p_caller: uid });
    const d = (t.data || {}) as any;
    const subs: any[] = d.subs || [];
    if (!subs.length) return json({ ok: true, sent: 0, limited: !!d.limited });
    const cfgRes = await sb.rpc("push_config");
    const cfg = (cfgRes.data || {}) as Record<string, string>;
    webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);
    const gone: string[] = [];
    const title = "📞 着信：" + String(d.caller || "ARE").slice(0, 40);
    const bodyText = (video ? "ビデオ通話" : "音声通話") + "の着信です。タップして出る";
    const webSubs = subs.filter((s) => !isFcm(s.endpoint));
    await Promise.all(webSubs.map(async (s) => {
      const payload = JSON.stringify(cancel
        ? { type: "clear", tag: "are-call", room }
        : { type: "call", title, body: bodyText, room, tag: "are-call", silent: !!s.silent, kind: video ? "video" : "audio" });
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: cancel ? 60 : 45, urgency: "high" });
      } catch (e: any) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) gone.push(s.endpoint);
        else console.error("call push failed", e && e.statusCode, String(e && e.body || "").slice(0, 120));
      }
    }));
    const fcmSent = await hubSend(cfg, subs.filter((s) => isFcm(s.endpoint)).map((s) => cancel
      ? { ...fcmIds(s.endpoint), type: "clear", tag: "are-call", room }
      : { ...fcmIds(s.endpoint), type: "call", title, body: bodyText, room, tag: "are-call", silent: !!s.silent }));
    if (gone.length) await sb.from("push_subscriptions").delete().in("endpoint", gone);
    return json({ ok: true, sent: webSubs.length - gone.length + fcmSent });
  } catch (_e) {
    return json({ ok: false, error: "server" }, 500);
  }
});
