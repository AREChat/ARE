"use strict";
// ===== 📲 ファイル転送（スマホ↔パソコン） =====
// ・自分専用の置き場（file-drop）にファイルを入れると、同じアカウントでログインした別の端末から ダウンロードできます。
// ・本人だけが見られます。7日たつと 自動で消えます。1つ50MBまで。
const FDR_BUCKET = "file-drop", FDR_DAYS = 7, FDR_LIMIT = 50 * 1024 * 1024;
const fdrB64 = (s) => { const b = new TextEncoder().encode(s); let t = ""; b.forEach((c) => { t += String.fromCharCode(c); }); return btoa(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const fdrUnb64 = (s) => { try{ const t = atob(String(s).replace(/-/g, "+").replace(/_/g, "/")); return new TextDecoder().decode(Uint8Array.from(t, (c) => c.charCodeAt(0))); }catch(_e){ return String(s); } };
function fdrParse(o){ const m = /^(\d{10,})_(.+)$/.exec(o.name || ""); return m ? {key: o.name, t: Number(m[1]), name: fdrUnb64(m[2]), size: o.metadata && o.metadata.size || 0} : null; }
function fdrTime(t){ const d = new Date(t); return (d.getMonth() + 1) + "/" + d.getDate() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
const fdrErr = (e) => { const m = String((e && e.message) || e); return /not found|bucket/i.test(m) ? "転送の置き場がまだ用意されていません（管理者がSQLを実行すると使えます）。" : /size|exceed|too large|413/i.test(m) ? "大きすぎます（50MBまで）。" : featError(e); };

async function fdrLoad(s){
  s.loading = true; ftPaint();
  try{
    const uid = state.user.id, st = requireClient().storage.from(FDR_BUCKET);
    const r = await st.list(uid, {limit: 200, sortBy: {column: "name", order: "desc"}});
    if(r.error) throw r.error;
    let items = (r.data || []).map(fdrParse).filter(Boolean);
    const old = items.filter((i) => Date.now() - i.t > FDR_DAYS * 86400000);
    if(old.length){ await st.remove(old.map((i) => uid + "/" + i.key)); items = items.filter((i) => !old.includes(i)); }
    s.items = items; s.ready = true;
  }catch(e){ s.items = []; s.ready = false; s.msg = fdrErr(e); }
  s.loading = false; ftPaint();
}
ftPainters.drop = (s) => {
  if(!s.started){ s.started = true; setTimeout(() => fdrLoad(s), 0); }
  const items = s.items || [];
  return '<div class="meta">ここに入れたファイルは、同じアカウントの別の端末から ダウンロードできます（' + FDR_DAYS + '日で消えます）。</div>' +
    ftPick("drop", "add", "📤 ファイルを送る（いくつでも）", "", true) +
    (s.busy ? '<div class="meta" role="status">送っています… ' + escapeHtml(s.busy) + '</div>' : "") +
    (s.loading ? '<div class="meta">読み込み中…</div>' : "") +
    (items.length ? '<div style="' + ftListStyle + '">' + items.map((i, n) => ftRow(escapeHtml(i.name) + ' <span class="meta">' + ftSize(i.size) + '・' + fdrTime(i.t) + '</span>', ftBtn("drop", "get-" + n, "⬇ 受け取る") + ftBtn("drop", "del-" + n, "🗑", {sub: true}))).join("") + '</div>' : (s.ready && !s.loading ? '<div class="meta">まだ ファイルはありません。</div>' : "")) +
    ftMsgHtml(s.msg) + '<div class="row">' + ftBtn("drop", "reload", "🔄 更新", {sub: true}) + '</div>';
};
ftActs.drop = async (a, node, s) => {
  if(a === "reload"){ await fdrLoad(s); return; }
  const uid = state.user.id, st = requireClient().storage.from(FDR_BUCKET);
  if(a === "add"){
    const list = Array.from(node.files); node.value = ""; if(!list.length) return;
    let ok = 0, bad = "";
    for(const f of list){
      if(f.size > FDR_LIMIT){ bad = "「" + f.name + "」は大きすぎます（50MBまで）。"; continue; }
      s.busy = f.name; ftPaint();
      try{
        const key = uid + "/" + Date.now() + "_" + fdrB64(f.name.slice(0, 100));
        const r = await st.upload(key, f, {contentType: f.type || "application/octet-stream", upsert: false});
        if(r.error) throw r.error; ok++;
      }catch(e){ bad = fdrErr(e); break; }
    }
    s.busy = ""; s.msg = (ok ? ok + "個 送りました。" : "") + (bad ? " " + bad : ""); await fdrLoad(s); return;
  }
  const m = /^(get|del)-(\d+)$/.exec(a); const it = m && (s.items || [])[Number(m[2])]; if(!it) return;
  if(m[1] === "get"){
    s.msg = "受け取り中…"; ftPaint();
    try{ const r = await st.download(uid + "/" + it.key); if(r.error) throw r.error; ftSave(r.data, it.name); s.msg = "「" + escapeHtml(it.name) + "」を受け取りました。"; }
    catch(e){ s.msg = fdrErr(e); }
    ftPaint(); return;
  }
  try{ const r = await st.remove([uid + "/" + it.key]); if(r.error) throw r.error; s.msg = "消しました。"; }catch(e){ s.msg = fdrErr(e); }
  await fdrLoad(s);
};
function openFileDrop(){ const s = ftSt.drop = ftSt.drop || {files: [], msg: ""}; s.started = false; s.items = []; s.ready = false; ftOpenTool("drop", "📲 ファイル転送（スマホ↔PC）", "同じアカウントの別の端末へ、ファイルを渡す"); }
