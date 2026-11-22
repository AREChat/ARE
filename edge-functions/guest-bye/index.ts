import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

// お試し（ゲスト）アカウントが「タブを閉じた」ときに、その場で消すための受け口。
// ・ブラウザの sendBeacon から、ログイン用の札（アクセストークン）だけが text/plain で届く。
//   特別なヘッダーを付けない「単純な送信」にしてあるので、事前確認（preflight）が要らず、
//   ページが閉じる途中でも最後まで送れる。
// ・札が本物か確かめ、その本人が「お試しアカウント」のときだけ消す（管理者・ふつうのユーザーは何も起きない）。
// ・消す中身は、ログアウトボタンや 2 日放置の自動削除と同じ（public.guest_delete_user_v1）。
// ・自分のアカウントしか消せない（他人の札は持っていないので）。結果は返さない（ページはもう無いため）。
export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ ok: false }, { status: 405 });
    try {
      const raw = (await req.text()).slice(0, 4000).trim();
      let token = raw;
      if (raw.startsWith("{")) { try { token = String(JSON.parse(raw).t ?? ""); } catch { token = ""; } }
      if (!token || token.length < 20 || token.length > 3500) return Response.json({ ok: false }, { status: 200 });
      const { data, error } = await ctx.supabaseAdmin.auth.getUser(token);
      if (error || !data?.user?.id) return Response.json({ ok: false }, { status: 200 });
      const { data: deleted, error: delError } = await ctx.supabaseAdmin.rpc("guest_delete_user_v1", { p_user: data.user.id });
      if (delError) { console.error("guest_delete_user_v1 failed:", delError.code); return Response.json({ ok: false }, { status: 200 }); }
      return Response.json({ ok: true, deleted: deleted === true }, { status: 200 });
    } catch (error) {
      console.error("guest-bye failed:", error instanceof Error ? error.message : "unknown");
      return Response.json({ ok: false }, { status: 200 });
    }
  }),
};
