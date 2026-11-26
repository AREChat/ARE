import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

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

// 既読になったとき、自分の「他の端末」に出ているそのチャットの通知だけを消すためのサイレントプッシュを送る。
// メッセージ内容は送らない（room_id とタグだけ）。
// ※ 2026-11-26：Android アプリ（Firebase）の宛先（fcm:…）には、GAS ハブ経由で「消して」を送る。
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POSTリクエストを使用してください。" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const caller = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: who, error: whoError } = await caller.auth.getUser();
  if (whoError || !who?.user) return json({ error: "ログインが必要です。" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON形式が正しくありません。" }, 400);
  }
  const roomId = body.room_id;
  if (typeof roomId !== "string") return json({ error: "room_id が必要です。" }, 400);

  const { data: isMember, error: memberError } = await caller.rpc("is_room_member", { p_room_id: roomId });
  if (memberError || isMember !== true) return json({ error: "このチャットのメンバーではありません。" }, 403);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: subs, error: subsError } = await admin.from("push_subscriptions").select("endpoint,p256dh,auth").eq("user_id", who.user.id);
  if (subsError) return json({ error: "通知先の取得に失敗しました。" }, 500);
  if (!subs || !subs.length) return json({ message: "none" });

  const { data: cfgRow } = await admin.rpc("push_config");
  const cfg = (cfgRow || {}) as Record<string, string>;
  if (!cfg.vapid_subject || !cfg.vapid_public || !cfg.vapid_private) return json({ error: "通知の設定がありません。" }, 500);
  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);

  const payload = JSON.stringify({ type: "clear", room: roomId, tag: "room-" + roomId });
  const gone: string[] = [];
  const webSubs = subs.filter((s) => !isFcm(s.endpoint));
  await Promise.all(webSubs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60, urgency: "normal" });
    } catch (e: any) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) gone.push(s.endpoint);
    }
  }));
  const fcmSent = await hubSend(cfg, subs.filter((s) => isFcm(s.endpoint)).map((s) => ({ ...fcmIds(s.endpoint), type: "clear", room: roomId, tag: "room-" + roomId })));
  if (gone.length) await admin.from("push_subscriptions").delete().in("endpoint", gone);
  return json({ message: "sent " + (webSubs.length - gone.length + fcmSent) });
});
