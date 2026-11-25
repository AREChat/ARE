// 写真をまとめて送ったとき（つづけて届いた写真）を、2枚ずつ ならべて表示する。
// ・送るデータは そのまま（写真は1枚ずつ別のメッセージ）。画面に出すときだけ、となりどうしをくっつけて見せる。
// ・同じ人が 2分以内に送った写真どうし、日付の区切りをまたがない、編集中・選択中でないものだけ。3枚なら 2枚＋1枚。
// ・返信・リアクション・削除などの操作は、それぞれの写真に今までどおりかかる。
const PP_GAP_MS = 2 * 60 * 1000;
function ppCss(){
    if(document.getElementById("ppCss")) return;
    const s = document.createElement("style"); s.id = "ppCss";
    s.textContent =
        ".photo-pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px 8px;align-self:flex-start;width:min(86%,520px);max-width:min(86%,520px)}.photo-pair.own{align-self:flex-end}" +
        ".photo-pair .pair-who{grid-column:1/-1;font-size:11px;color:var(--muted);margin:0 0 1px 3px}.photo-pair.own .pair-who{text-align:right;margin:0 3px 1px 0}" +
        ".photo-pair .message-row{max-width:none;min-width:0;flex-direction:column;align-items:stretch;gap:2px}.photo-pair .message-row.own{flex-direction:column}" +
        ".photo-pair .message-avatar,.photo-pair .message-sender{display:none}.photo-pair .message-body{min-width:0}" +
        ".photo-pair .bubble{padding:4px}.photo-pair .attachment{max-width:100%}.photo-pair .attachment img{width:100%;height:clamp(110px,34vw,190px);object-fit:cover}" +
        ".photo-pair .tool-row{flex-wrap:wrap;gap:2px;max-width:100%}.photo-pair .tool-icon{min-width:28px;min-height:28px;padding:2px 4px}.photo-pair .message-row.own .tool-row{justify-content:flex-end}" +
        ".photo-pair .file-meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.photo-pair .message-time{font-size:10px}.photo-pair .message-actions{flex-wrap:wrap}";
    document.head.appendChild(s);
}
function ppIsPhoto(row){
    if(!row || !row.classList || !row.classList.contains("message-row")) return false;
    if(row.classList.contains("msg-picked") || row.classList.contains("msg-pickable")) return false;
    const b = row.querySelector(".bubble");
    if(!b || b.classList.contains("stamp-img") || b.classList.contains("edit")) return false;
    const a = b.querySelector(":scope > .attachment > a > img");
    return !!a && !b.querySelector("video,audio,.lv-box");
}
function ppGroup(){
    const root = document.getElementById("messages"); if(!root) return;
    ppCss();
    const rows = Array.from(root.children);
    for(let i = 0; i < rows.length - 1; i++){
        const a = rows[i], b = rows[i + 1];
        if(!ppIsPhoto(a) || !ppIsPhoto(b)) continue;
        if(a.dataset.sid !== b.dataset.sid) continue;
        const ta = Number(a.dataset.ts), tb = Number(b.dataset.ts);
        if(!(ta > 0 && tb > 0) || Math.abs(tb - ta) > PP_GAP_MS) continue;
        const wrap = document.createElement("div");
        wrap.className = "photo-pair" + (a.classList.contains("own") ? " own" : "");
        const who = a.querySelector(".message-sender");
        const lab = document.createElement("div"); lab.className = "pair-who"; lab.textContent = who ? who.textContent : "";
        wrap.appendChild(lab);
        root.insertBefore(wrap, a); wrap.appendChild(a); wrap.appendChild(b);
        i++;   // この2枚は おわり。つぎの写真から また組みなおす
    }
}
function initPhotoPair(){ addRenderHook(ppGroup); }
