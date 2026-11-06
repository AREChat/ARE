import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { createClient } from "npm:@supabase/supabase-js@2";

// 登録不要のお試しアカウントを作って、ログイン済みのセッションを返す。
// 悪用を防ぐため、同じ接続元からは10分に5回まで（登録用と同じ仕組み）。
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "POSTリクエストを使用してください。" }, { status: 405 });

    const clientIp = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "";
    if (!clientIp || clientIp.length > 128) return Response.json({ error: "接続元を確認できません。時間をおいて再度お試しください。" }, { status: 503 });

    let createdUserId: string | null = null;
    try {
      const { data: rate, error: rateError } = await ctx.supabaseAdmin.rpc("register_check_rate_limit_v1", { p_key_hash: await sha256("guest:" + clientIp) });
      if (rateError || !rate || typeof rate.allowed !== "boolean") return Response.json({ error: "お試しを開始できません。時間をおいて再度お試しください。" }, { status: 503 });
      if (!rate.allowed) {
        const retryAfter = Number(rate.retryAfterSeconds) || 600;
        return Response.json({ error: "お試しの回数が上限に達しました。時間をおいて再度お試しください。", retryAfterSeconds: retryAfter }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
      }

      const id = crypto.randomUUID();
      const email = `guest-${id}@login.are.invalid`;
      const password = hex(24) + "aA1!";
      const displayName = "ゲスト" + String(Math.floor(Math.random() * 9000) + 1000);

      const { data: authData, error: authError } = await ctx.supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { display_name: displayName, name: displayName, full_name: displayName, guest: true },
      });
      if (authError || !authData.user) return Response.json({ error: "お試しを開始できませんでした。時間をおいて再度お試しください。" }, { status: 500 });
      createdUserId = authData.user.id;

      const { error: saveError } = await ctx.supabaseAdmin.rpc("register_guest_v1", { p_user_id: createdUserId, p_display_name: displayName });
      if (saveError) {
        console.error("register_guest_v1 failed:", saveError.code);
        await ctx.supabaseAdmin.auth.admin.deleteUser(createdUserId);
        createdUserId = null;
        return Response.json({ error: "お試しを開始できませんでした。時間をおいて再度お試しください。" }, { status: 500 });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
      if (!supabaseUrl || !anonKey) return Response.json({ error: "認証サービスを利用できません。" }, { status: 500 });
      const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email, password });
      if (signInError || !signIn.session) return Response.json({ error: "お試しを開始できませんでした。時間をおいて再度お試しください。" }, { status: 500 });

      return Response.json({
        message: "お試しを始めました。",
        accessToken: signIn.session.access_token,
        refreshToken: signIn.session.refresh_token,
        expiresAt: signIn.session.expires_at,
        user: { id: signIn.user.id },
      }, { status: 201 });
    } catch (error) {
      if (createdUserId) await ctx.supabaseAdmin.auth.admin.deleteUser(createdUserId).catch(() => {});
      console.error("guest-start failed:", error instanceof Error ? error.message : "unknown");
      return Response.json({ error: "お試しを開始できませんでした。時間をおいて再度お試しください。" }, { status: 500 });
    }
  }),
};
