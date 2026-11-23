"use strict";
// ===== 「選んでコピー」：メッセージを いくつか選んで、まとめてコピーする =====
// ・メッセージの下のボタン列の ☑️ を押すと「選ぶモード」になる（そのメッセージが最初から選ばれる）。
// ・選ぶモード中は、メッセージを タップするたびに 選ぶ／外す。下のバーで「コピー」「全部」「やめる」。
// ・コピーされる形：「名前（月/日 時:分）」の次の行に 本文。写真・動画・ファイルなどは [写真] のような目印になる。
// ・文字の一部だけ コピーしたいときは、ふだんどおり 文字を長押し／なぞって 選べる（chat-longtext.js ほか）。
const selc = {on:false, ids:new Set(), bar:null};

function selcLabel(item){
    switch(item && item.type){
        case "image": return item.stamp ? "[スタンプ]" : "[写真]";
        case "video": return "[動画]";
        case "audio": return "[ボイスメッセージ]";
        case "file": return "[ファイル] " + String(item.name || item.filename || "").trim();
        case "location": return "[位置情報]";
        case "poll": return "[アンケート] " + String(item.question || item.title || "").trim();
        case "contact": return "[連絡先]";
        case "game": return "[ゲーム]";
        default: return "[メッセージ]";
    }
}

function selcStamp(value){
    const d = new Date(value);
    if(Number.isNaN(d.getTime())) return "";
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + d.getHours() + ":" + String(d.getMinutes()).padStart(2,"0");
}

/** 選んだメッセージを、古い順に ならべた コピー用の文章にする */
function selcBuildText(){
    const parts = [];
    for(const m of state.messages){
        if(!selc.ids.has(m.id)) continue;
        const own = m.sender_id === (state.user && state.user.id);
        const profile = own ? state.profile : ((feat.known && feat.known.get(m.sender_id)) || state.currentPartner);
        const name = (own ? (typeof profileDisplayName === "function" ? profileDisplayName(profile) : "") : (typeof profileDisplayName === "function" ? profileDisplayName(profile) : "")) || (own ? "あなた" : "相手");
        const item = parseMessageContent(m.content);
        let text;
        if(item.type === "text"){
            const raw = String(item.text || "");
            const body = typeof cpExtractBody === "function" ? cpExtractBody(raw) : null;
            text = body !== null ? body : raw;
        }else text = selcLabel(item);
        parts.push(name + "（" + selcStamp(m.created_at) + "）\n" + text);
    }
    return parts.join("\n\n");
}

function selcPaint(){
    document.body.classList.toggle("sel-mode", selc.on);
    el.messages.querySelectorAll("article[data-mid]").forEach((row) => row.classList.toggle("sel-on", selc.on && selc.ids.has(row.dataset.mid)));
    if(selc.bar){
        selc.bar.hidden = !selc.on;
        const n = selc.ids.size;
        selc.bar.querySelector(".sel-count").textContent = n ? n + "件を選んでいます" : "コピーしたいメッセージを タップ";
        selc.bar.querySelector("[data-sel=copy]").disabled = !n;
        const all = state.messages.length && state.messages.every((m) => selc.ids.has(m.id));
        selc.bar.querySelector("[data-sel=all]").textContent = all ? "全部はずす" : "全部";
    }
}

function selcEnter(id){ selc.on = true; selc.ids = new Set(id ? [id] : []); selcPaint(); }
function selcExit(){ if(!selc.on && !selc.ids.size) return; selc.on = false; selc.ids = new Set(); selcPaint(); }

function initSelCopy(){
    if(!window.AREFeatures.ok("msgmenu")) throw new Error("メッセージ操作メニューが起動していません。");
    addMsgTool({id:"selcopy", icon:"☑️", label:"選んでコピー（いくつかまとめて）", run:(m) => selcEnter(m.id)});
    addRenderHook(selcPaint);
    addRoomHook(() => selcExit());

    const composer = document.querySelector(".composer");
    if(composer){
        const bar = document.createElement("div");
        bar.id = "selBar"; bar.className = "sel-bar"; bar.hidden = true;
        bar.innerHTML = '<span class="sel-count"></span><button type="button" class="button-secondary" data-sel="all">全部</button><button type="button" class="button" data-sel="copy">📋 コピー</button><button type="button" class="button-secondary" data-sel="cancel">やめる</button>';
        composer.insertAdjacentElement("beforebegin", bar);
        selc.bar = bar;
        bar.addEventListener("click", (event) => {
            const b = event.target.closest("[data-sel]"); if(!b) return;
            const act = b.dataset.sel;
            if(act === "cancel") selcExit();
            else if(act === "all"){
                const all = state.messages.length && state.messages.every((m) => selc.ids.has(m.id));
                selc.ids = new Set(all ? [] : state.messages.map((m) => m.id)); selcPaint();
            }else if(act === "copy"){
                const text = selcBuildText();
                if(!text) return;
                cpCopyText(text);
                selcExit();
            }
        });
    }
    // 選ぶモード中は、メッセージを押すと 選ぶ／外す（写真が開く・リンクが開く、などは止める）
    el.messages.addEventListener("click", (event) => {
        if(!selc.on) return;
        const row = event.target.closest("article[data-mid]");
        if(!row) return;
        event.preventDefault(); event.stopPropagation();
        const id = row.dataset.mid;
        if(selc.ids.has(id)) selc.ids.delete(id); else selc.ids.add(id);
        selcPaint();
    }, true);
    document.addEventListener("keydown", (event) => { if(selc.on && event.key === "Escape") selcExit(); });
}
