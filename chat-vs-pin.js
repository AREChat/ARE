"use strict";
// ===== 対戦パネル：いま遊んでいる対戦の盤を、画面の上に固定して表示する =====
// 盤は会話の上のほうに残り、「○○に置きました」は下に積まれていく。→ スクロールしなくても 盤が見えて そのまま打てるようにする。
feat.vsPin = {panel:null, gid:"", open:true};

function vsPinFind(){
    if(typeof vsCompute !== "function" || !state.currentRoom) return "";
    const starts = [];
    for(let i = state.messages.length - 1; i >= 0 && starts.length < 6; i--){
        const m = state.messages[i];
        if(!m.content || m.content.indexOf('"start"') < 0) continue;
        const item = parseMessageContent(m.content);
        if(item && item.type === "game" && item.kind === "start" && item.gid && VS_ENGINES[item.game]) starts.push({m, item});
    }
    for(const s of starts){
        let S = null;
        try{ S = vsCompute(s.item.gid); }catch(_e){ S = null; }
        if(!S || S.over) continue;
        if(S.game === "sugo" && S.phase === "join") continue;
        const mine = S.players.includes(state.user.id) || S.players.includes(null) || S.starter === state.user.id;
        if(mine) return s.item.gid;
    }
    return "";
}

function vsPinPaint(){
    const v = feat.vsPin;
    if(!v.panel) return;
    const gid = state.currentRoom ? vsPinFind() : "";
    if(!gid){ v.gid = ""; v.panel.hidden = true; v.panel.innerHTML = ""; return; }
    const startMsg = state.messages.find((m) => m.content && m.content.indexOf(gid) >= 0 && (parseMessageContent(m.content) || {}).kind === "start");
    if(!startMsg){ v.panel.hidden = true; return; }
    const item = parseMessageContent(startMsg.content);
    const body = v.panel.querySelector(".vspin-body");
    const keep = body ? body.scrollTop : 0;
    v.gid = gid; v.panel.hidden = false;
    let html = "";
    try{ html = renderGameBubble(item, true); }catch(error){ console.error("[ARE vs pin]", error); v.panel.hidden = true; return; }
    v.panel.innerHTML = '<div class="vspin-head"><b>🎮 いま対戦中</b><button type="button" class="button-secondary vspin-toggle" aria-expanded="' + (v.open ? "true" : "false") + '">' + (v.open ? "たたむ" : "ひらく") + '</button></div><div class="vspin-body"' + (v.open ? "" : " hidden") + '>' + html + '</div>';
    const nb = v.panel.querySelector(".vspin-body"); if(nb) nb.scrollTop = keep;
}

function initVsPin(){
    const v = feat.vsPin;
    const panel = document.createElement("section");
    panel.id = "vsPin"; panel.className = "vspin"; panel.hidden = true; panel.setAttribute("aria-label", "対戦パネル");
    el.messages.parentNode.insertBefore(panel, el.messages);
    v.panel = panel;
    panel.addEventListener("click", (event) => {
        if(event.target.closest(".vspin-toggle")){ v.open = !v.open; vsPinPaint(); return; }
        const node = event.target.closest("[data-vs]");
        if(!node || node.disabled) return;
        runTool(() => vsAction(node.dataset.vs, node.dataset.k || "move", node.dataset.i));
    });
    panel.addEventListener("submit", (event) => {
        const form = event.target.closest("[data-vsform]");
        if(!form) return;
        event.preventDefault();
        const input = form.querySelector("input");
        const value = input ? input.value.trim() : "";
        if(input) input.value = "";
        if(value) runTool(() => vsAction(form.dataset.vsform, "move", value));
    });
    addRenderHook(vsPinPaint);
    addRoomHook(() => { v.gid = ""; panel.hidden = true; panel.innerHTML = ""; });
    // 会話のほうの 開始バブルは、パネルに出している間は 小さくする（盤が2つ並ばないように）
    const orig = renderGameBubble;
    renderGameBubble = function(item, forPanel){
        if(!forPanel && item && item.kind === "start" && v.gid && item.gid === v.gid && !panel.hidden){
            const info = VS_GAMES[item.game] || {icon:"🎮", name:"対戦"};
            return '<div class="bubble vs-move">' + info.icon + ' ' + escapeHtml(info.name) + '：対戦中（上のパネルで打てます）</div>';
        }
        return orig.call(this, item);
    };
}
