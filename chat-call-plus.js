"use strict";
// ===== 通話中の「＋」メニュー（15の機能）と、議事録 =====
//   1 録音・録画（自動・止められない／止められるのは管理者だけ）  2 メモ  3 しおり  4 ToDo・決定事項  5 タイマー
//   6 字幕（文字おこし）  7 スクリーンショット  8 通信状況  9 音声調整  10 出力先・音量
//   11 小窓（ピクチャインピクチャ）  12 挙手  13 議事録  14 画面の見かた・全画面  15 ロック・画面を消さない
// ・録音・録画の本体は chat-call-rec.js。ここは、通話の画面に「＋」ボタンと、機能のシートを足す。
// ・メモ・しおり・ToDo・字幕は、通話が終わると「議事録（.md）」にまとめて、録画といっしょに ドライブへ自動で送る（chat-call-rec.js）。
// ・chat-call.js からは、telxOpen / telxLive / telxEnd / telxMsg / telxIncoming / telxInit だけを呼ぶ（壊れても通話は続く）。

const TELX_EMOJI_LANG = {ja:"ja-JP", en:"en-US", zh:"zh-CN", ko:"ko-KR"};
const telxUi = {sheet:null, body:null, title:null, back:null, view:"", live:null, plus:null};

/** 言語に合わせた文（議事録の見出しなど）。辞書がなければ日本語のまま */
function telxT(s){
    try{ const I = window.AREI18N; if(I && I.lang && I.lang !== "ja") return I.tr(s, I.lang) || s; }catch(_e){}
    return s;
}
function telxLang(){ try{ return (window.AREI18N && window.AREI18N.lang) || "ja"; }catch(_e){ return "ja"; } }
function telxNew(){
    return {parts:0, rec:null, recOn:false, recBusy:false, recStopped:"", recErr:"", saveErr:false, done:[], log:[], notes:"", marks:[], todos:[], caps:[],
        capOn:false, capLang:TELX_EMOJI_LANG[telxLang()] || "ja-JP", capRec:null, hand:false, peerHand:false, tm:null, tmSync:true, layout:"remote", locked:false, wake:null, wakeOn:true,
        shots:0, prevStats:null, minSaved:false, tick:0, persistAt:0};
}
function telxColon(){ return telxLang() === "ja" || telxLang() === "zh" ? "：" : ": "; }
function telxElapsed(call){ return call && call.startAt ? Math.max(0, Math.round((Date.now() - call.startAt) / 1000)) : 0; }

// ===== 見た目 =====
function telxCss(){
    if(document.getElementById("telxCss")) return;
    const s = document.createElement("style"); s.id = "telxCss";
    s.textContent =
        ".telx-rec{display:inline-flex;align-items:center;gap:6px;margin-top:6px;padding:3px 12px;border-radius:999px;background:rgba(224,68,62,.18);border:1px solid #e0443e;font-size:13px;font-weight:700;flex-wrap:wrap;justify-content:center}.telx-rec[hidden],.telx-note[hidden]{display:none}" +
        ".telx-rec i{width:10px;height:10px;border-radius:50%;background:#ff4d4d;animation:telxBlink 1.2s infinite}.telx-rec.off{background:#33384a;border-color:#6b7488}.telx-rec.off i{background:#8a93a8;animation:none}.telx-t{font-variant-numeric:tabular-nums}" +
        "@keyframes telxBlink{50%{opacity:.25}}@media (prefers-reduced-motion:reduce){.telx-rec i{animation:none}}" +
        ".telx-note{margin-top:6px;font-size:12px;color:#ffd27c}" +
        ".tel-bar button.telx-plus{background:#3b57d6;font-size:28px;line-height:1;font-weight:700}.tel-bar button.telx-plus.on{background:#fff;color:#111}" +
        ".telx-sheet{position:absolute;left:0;right:0;bottom:96px;z-index:7;max-height:60%;display:flex;flex-direction:column;background:rgba(14,19,34,.98);border-top:1px solid #3a4a6c;border-radius:18px 18px 0 0;box-shadow:0 -10px 30px rgba(0,0,0,.5)}.telx-sheet[hidden]{display:none}" +
        ".telx-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #26324a}.telx-head b{flex:1;font-size:16px}.telx-head button,.telx-x{border:0;background:#26324a;color:#fff;border-radius:10px;min-width:40px;height:36px;font-size:16px}.telx-head button[hidden]{display:none}" +
        ".telx-body{overflow:auto;padding:12px;-webkit-overflow-scrolling:touch}" +
        ".telx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:10px}.telx-tile{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px;border:1px solid #2b3851;border-radius:14px;background:#1a2338;color:#fff;font-size:12px;line-height:1.25;text-align:center;min-height:78px}.telx-tile span{font-size:26px}.telx-tile.on{border-color:#7c9cff;background:#243064}.telx-tile .bd{position:absolute;top:4px;right:6px;font-size:11px;background:#e0443e;border-radius:999px;padding:0 6px}.telx-tile:disabled{opacity:.45}" +
        ".telx-p{margin:0 0 10px;font-size:13.5px;color:#cdd6ee;line-height:1.55}.telx-big{margin:0 0 8px;font-size:18px;font-weight:700}.telx-warn{color:#ffd27c}" +
        ".telx-row{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;align-items:center}.telx-b{border:0;border-radius:10px;padding:10px 14px;background:#26324a;color:#fff;font-weight:700;font-size:14px;min-height:42px}.telx-b.pri{background:#3b57d6}.telx-b.dng{background:#e0443e}.telx-b.on{background:#fff;color:#111}.telx-b:disabled{opacity:.45}" +
        ".telx-in,.telx-ta,.telx-sel{width:100%;box-sizing:border-box;border:1px solid #3a4a6c;border-radius:10px;background:#0e1424;color:#fff;padding:9px 10px;font-size:15px;font-family:inherit}.telx-ta{min-height:150px;resize:vertical}.telx-in.s{width:auto;flex:1;min-width:120px}" +
        ".telx-list{list-style:none;margin:8px 0;padding:0;display:grid;gap:6px}.telx-list li{display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border-radius:10px;background:#18213a;font-size:14px}.telx-list li .tm{color:#9fb2ff;font-variant-numeric:tabular-nums;flex:none}.telx-list li .tx{flex:1;word-break:break-word}.telx-list li button{border:0;background:transparent;color:#ff8d8d;font-size:16px}.telx-list li.done .tx{text-decoration:line-through;opacity:.6}" +
        ".telx-kv{display:grid;grid-template-columns:1fr auto;gap:6px 12px;font-size:14px}.telx-kv b{font-variant-numeric:tabular-nums}.telx-good{color:#6ee7a6}.telx-mid{color:#ffd27c}.telx-bad{color:#ff8d8d}" +
        ".telx-hands{position:absolute;left:10px;top:10px;z-index:3;display:flex;flex-direction:column;gap:6px}.telx-hand{background:rgba(255,210,74,.95);color:#201400;font-weight:800;border-radius:999px;padding:4px 12px;font-size:14px}" +
        ".telx-cap{position:absolute;left:8px;right:8px;bottom:84px;z-index:3;text-align:center;font-size:17px;line-height:1.4;color:#fff;background:rgba(0,0,0,.62);border-radius:10px;padding:6px 10px;pointer-events:none}.telx-cap[hidden]{display:none}.telx-cap small{display:block;color:#9fb2ff;font-size:11px}" +
        ".telx-tm{position:absolute;right:10px;top:10px;z-index:3;background:rgba(0,0,0,.65);border:1px solid #7c9cff;border-radius:12px;padding:4px 12px;font-size:22px;font-weight:800;font-variant-numeric:tabular-nums}.telx-tm[hidden]{display:none}.telx-tm.end{background:#e0443e;border-color:#fff}" +
        ".tel-stage.telx-L-swap video.tel-remote{inset:auto;right:10px;bottom:10px;width:min(30%,150px);height:auto;aspect-ratio:3/4;z-index:2;border-radius:10px;border:1px solid #2b3851;object-fit:cover}.tel-stage.telx-L-swap video.tel-pip{inset:0;right:auto;bottom:auto;width:100%;height:100%;aspect-ratio:auto;border-radius:0;border:0;z-index:1;object-fit:contain}" +
        ".tel-stage.telx-L-split video.tel-remote{inset:0 50% 0 0;width:50%;height:100%}.tel-stage.telx-L-split video.tel-pip{inset:0 0 0 50%;right:0;bottom:0;width:50%;height:100%;aspect-ratio:auto;border-radius:0;border:0;object-fit:contain}" +
        ".telx-lock{position:absolute;inset:0;z-index:9;background:rgba(0,0,0,.25);display:flex;align-items:flex-end;justify-content:center;padding-bottom:calc(30px + env(safe-area-inset-bottom))}.telx-lock[hidden]{display:none}.telx-lock button{border:0;border-radius:999px;padding:12px 22px;background:#26324a;color:#fff;font-weight:700;font-size:15px;position:relative;overflow:hidden}.telx-lock button i{position:absolute;left:0;bottom:0;height:4px;width:0;background:#7c9cff}" +
        ".telx-recnote{display:block;margin-top:8px;color:#ffd27c;font-size:13px}" +
        ".telx-viewer{position:fixed;inset:0;z-index:9996;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:12px}.telx-vwin{background:#10162e;color:#fff;border:2px solid #7c9cff;border-radius:14px;width:min(94vw,640px);max-height:92vh;overflow:auto;padding:14px}.telx-vhead{display:flex;align-items:center;gap:8px;margin-bottom:8px}.telx-vhead b{flex:1;font-size:18px}" +
        ".telx-vnote{font-size:12.5px;color:#b6c2da;margin:0 0 10px}.telx-vplay{margin:8px 0}.telx-video{width:100%;max-height:50vh;background:#000;border-radius:10px}.telx-pre{white-space:pre-wrap;word-break:break-word;background:#0e1424;border-radius:10px;padding:10px;font-size:13px;max-height:40vh;overflow:auto}" +
        ".telx-vrow{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;padding:10px;border-radius:10px;background:#18213a;margin-bottom:8px}.telx-vt{display:flex;flex-direction:column;gap:2px;min-width:0}.telx-vt small{color:#9aa8c2}.telx-vs{color:#9fb2ff!important}.telx-vact{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.telx-vact button{border:0;border-radius:8px;padding:8px 10px;background:#26324a;color:#fff;font-size:13px;min-height:36px}.telx-vact .telx-del.arm{background:#e0443e}.telx-empty{color:#9aa8c2;text-align:center;padding:16px}";
    document.head.appendChild(s);
}

// ===== 組みこみ =====
function telxBuild(){
    if(telxUi.sheet || !tel.ui) return;
    telxCss();
    const u = tel.ui, ov = u.ov;
    const top = ov.querySelector(".tel-top");
    top.appendChild(telxH("div", {class:"telx-rec", id:"telxRec", hidden:true, role:"status"}, telxH("i"), telxH("span", {id:"telxRecTx", text:"録音・録画中"}), telxH("span", {id:"telxRecT", class:"telx-t", text:"0:00"}),
        telxH("span", {id:"telxRecW", hidden:true, text:"⚠ この端末に保存できない部分があります"}), telxH("span", {id:"telxRecPeer", hidden:true, text:"相手の端末は、録音・録画していません"})));
    top.appendChild(telxH("div", {class:"telx-note", id:"telxNote", text:"この通話は、つながると自動で録音・録画されます。"}));
    const stage = ov.querySelector(".tel-stage");
    stage.appendChild(telxH("div", {class:"telx-hands", id:"telxHands"}));
    stage.appendChild(telxH("div", {class:"telx-cap", id:"telxCap", hidden:true}));
    stage.appendChild(telxH("div", {class:"telx-tm", id:"telxTm", hidden:true}));
    const bar = ov.querySelector(".tel-bar"), endBox = u.end.closest(".tb");
    telxUi.plus = telxH("button", {type:"button", id:"telPlus", class:"telx-plus", title:"機能（メモ・しおり・字幕など）", "aria-label":"機能", "aria-expanded":"false", onclick:telxToggle, text:"＋"});
    bar.insertBefore(telxH("div", {class:"tb"}, telxUi.plus, telxH("small", {text:"機能"})), endBox);
    telxUi.back = telxH("button", {type:"button", id:"telxBack", hidden:true, "aria-label":"もどる", text:"←", onclick:() => telxShow("grid")});
    telxUi.title = telxH("b", {id:"telxTitle", text:"機能"});
    telxUi.body = telxH("div", {class:"telx-body", id:"telxBody"});
    telxUi.sheet = telxH("div", {class:"telx-sheet", id:"telxSheet", hidden:true, role:"dialog", "aria-label":"機能"},
        telxH("div", {class:"telx-head"}, telxUi.back, telxUi.title, telxH("button", {type:"button", "aria-label":"閉じる", text:"✕", onclick:telxClose})), telxUi.body);
    ov.appendChild(telxUi.sheet);
    const lock = telxH("div", {class:"telx-lock", id:"telxLock", hidden:true}, telxH("button", {type:"button", id:"telxUnlock"}, "🔒 長押しでロックを解除", telxH("i")));
    ov.appendChild(lock);
    telxBindUnlock(lock.querySelector("button"));
    ov.addEventListener("keydown", (ev) => { if(ev.key === "Escape" && telxUi.sheet && !telxUi.sheet.hidden){ ev.stopPropagation(); telxClose(); } });
    window.addEventListener("resize", () => { if(telxUi.sheet && !telxUi.sheet.hidden) telxFitSheet(); });
}
function telxToggle(){ if(!telxUi.sheet) return; if(telxUi.sheet.hidden) telxOpenSheet(); else telxClose(); }
/** 機能の窓は、下のボタンの列（ミュート・切る など）の「上」に出す＝開いたままでも、いつでも切れる */
function telxFitSheet(){
    try{
        const ov = tel.ui && tel.ui.ov, bar = ov && ov.querySelector(".tel-bar"), sh = telxUi.sheet; if(!sh || !bar) return;
        const bh = bar.offsetHeight || 96;
        sh.style.bottom = bh + "px";
        sh.style.maxHeight = Math.max(170, (ov.clientHeight || window.innerHeight) - bh - 64) + "px";
    }catch(_e){}
}
function telxOpenSheet(){ if(!telxUi.sheet) return; telxUi.sheet.hidden = false; telxUi.plus.classList.add("on"); telxUi.plus.setAttribute("aria-expanded", "true"); telxFitSheet(); telxShow("grid"); }
function telxClose(){
    if(!telxUi.sheet) return;
    telxUi.sheet.hidden = true; telxUi.plus && telxUi.plus.classList.remove("on"); telxUi.plus && telxUi.plus.setAttribute("aria-expanded", "false"); telxUi.live = null; telxUi.view = "";
}

// ===== 15 の機能 =====
const TELX_FEATS = [
    {id:"rec", icon:"⏺️", label:"録音・録画", view:vRec, badge:(c) => c.x.recOn ? "●" : ""},
    {id:"memo", icon:"📝", label:"メモ", view:vMemo, badge:(c) => c.x.notes ? "✓" : ""},
    {id:"mark", icon:"🔖", label:"しおり", view:vMark, badge:(c) => c.x.marks.length ? String(c.x.marks.length) : ""},
    {id:"todo", icon:"✅", label:"ToDo・決定事項", view:vTodo, badge:(c) => c.x.todos.length ? String(c.x.todos.length) : ""},
    {id:"timer", icon:"⏱️", label:"タイマー", view:vTimer, badge:(c) => c.x.tm ? "●" : ""},
    {id:"cap", icon:"💬", label:"字幕", view:vCap, badge:(c) => c.x.capOn ? "●" : ""},
    {id:"shot", icon:"📸", label:"スクリーンショット", view:vShot, badge:() => ""},
    {id:"net", icon:"📡", label:"通信状況", view:vNet, badge:() => ""},
    {id:"audio", icon:"🎚️", label:"音声調整", view:vAudio, badge:() => ""},
    {id:"out", icon:"🔈", label:"出力先・音量", view:vOut, badge:() => ""},
    {id:"pip", icon:"🪟", label:"小窓で見る", view:vPip, badge:() => ""},
    {id:"hand", icon:"🙋", label:"挙手", view:vHand, badge:(c) => c.x.hand ? "●" : ""},
    {id:"min", icon:"📋", label:"議事録", view:vMin, badge:() => ""},
    {id:"layout", icon:"🖼️", label:"画面の見かた", view:vLayout, badge:() => ""},
    {id:"lock", icon:"🔒", label:"ロック・画面オン", view:vLock, badge:(c) => c.x.locked ? "●" : ""}
];
function telxShow(id){
    const call = tel.call; if(!call || !call.x || !telxUi.body) return;
    telxUi.live = null; telxUi.view = id; telxUi.body.textContent = "";
    telxUi.back.hidden = id === "grid";
    if(id === "grid"){
        telxUi.title.textContent = "機能";
        const grid = telxH("div", {class:"telx-grid"});
        TELX_FEATS.forEach((f) => {
            const bd = f.badge(call);
            const b = telxH("button", {type:"button", class:"telx-tile" + (bd ? " on" : ""), "data-f":f.id, onclick:() => telxShow(f.id)}, telxH("span", {text:f.icon, "aria-hidden":"true"}), f.label, bd ? telxH("em", {class:"bd", text:bd}) : null);
            grid.appendChild(b);
        });
        telxUi.body.appendChild(grid);
        return;
    }
    const f = TELX_FEATS.find((q) => q.id === id); if(!f) return;
    telxUi.title.textContent = f.icon + " " + f.label;
    f.view(telxUi.body, call);
}
function telxBtn(text, fn, cls){ return telxH("button", {type:"button", class:"telx-b" + (cls ? " " + cls : ""), text, onclick:fn}); }
function telxP(text, cls){ return telxH("p", {class:"telx-p" + (cls ? " " + cls : ""), text}); }

// 1 録音・録画
function vRec(b, call){
    const x = call.x;
    const st = telxH("p", {class:"telx-big"}), cnt = telxH("span"), acts = telxH("div", {class:"telx-row"});
    b.appendChild(st);
    b.appendChild(telxP("通話がつながると自動ではじまり、通話中は止められません。止める・再開するのは、管理者だけです。録音・録画は、この端末に残し、ドライブ（ファイル保存と同じフォルダ）へ自動で送ります。"));
    b.appendChild(telxH("p", {class:"telx-p"}, "記録した数：", cnt));
    b.appendChild(acts);
    const paint = () => {
        st.textContent = x.recOn ? "● 録音・録画中" : (x.recErr ? "この端末では録音・録画できません" : "録音・録画は止まっています");
        cnt.textContent = String(x.parts);
        acts.textContent = "";
        if(telxCanStopRec()){
            if(x.recOn) acts.appendChild(telxBtn("⏹ 録音・録画を止める（管理者のみ）", () => { if(telxAdminStop(call)) setTimeout(paint, 300); }, "dng"));
            else if(!x.recBusy) acts.appendChild(telxBtn("⏺ 録音・録画を再開する（管理者のみ）", () => { telxAdminResume(call); setTimeout(paint, 300); }, "pri"));
        }
        acts.appendChild(telxBtn("🎞 通話の記録を開く", telxOpenViewer));
    };
    paint(); telxUi.live = paint;
    if(!telxCanStopRec()) b.appendChild(telxP("止める・再開するボタンは、管理者だけに表示されます。", "telx-warn"));
}
// 2 メモ
function vMemo(b, call){
    const x = call.x;
    const ta = telxH("textarea", {class:"telx-ta", maxlength:"20000", "aria-label":telxT("メモ"), placeholder:telxT("ここに書いたメモは、通話が終わると議事録になります。")});   // textarea の属性は 自動翻訳の対象外なので、ここで訳す
    ta.value = x.notes;
    ta.addEventListener("input", () => { x.notes = ta.value; telxPersist(call); });
    b.appendChild(ta);
    b.appendChild(telxH("div", {class:"telx-row"}, telxBtn("🕒 いまの時刻を入れる", () => { const ins = "[" + telxDur(telxElapsed(call)) + "] "; const p = ta.selectionStart || ta.value.length; ta.value = ta.value.slice(0, p) + ins + ta.value.slice(p); ta.focus(); ta.selectionStart = ta.selectionEnd = p + ins.length; x.notes = ta.value; telxPersist(call); })));
    b.appendChild(telxP("メモは、この端末に自動で保存されます。"));
}
// 3 しおり
function vMark(b, call){
    const x = call.x;
    const inp = telxH("input", {class:"telx-in s", type:"text", maxlength:"80", placeholder:"ひとこと（なくてもOK）", "aria-label":"しおりのひとこと"});
    const list = telxH("ul", {class:"telx-list"});
    const paint = () => {
        list.textContent = "";
        x.marks.forEach((m, i) => list.appendChild(telxH("li", null, telxH("span", {class:"tm", text:telxDur(m.at)}), telxH("span", {class:"tx", text:m.label || "（しおり）"}), telxH("button", {type:"button", "aria-label":"削除", text:"✕", onclick:() => { x.marks.splice(i, 1); telxPersist(call); paint(); }}))));
    };
    const add = () => { x.marks.push({at:telxElapsed(call), label:inp.value.trim().slice(0, 80)}); inp.value = ""; telxPersist(call); paint(); showToast("しおりを入れました。"); };
    inp.addEventListener("keydown", (ev) => { if(ev.key === "Enter"){ ev.preventDefault(); add(); } });
    b.appendChild(telxH("div", {class:"telx-row"}, inp, telxBtn("🔖 しおりを入れる", add, "pri")));
    b.appendChild(telxP("大事なところに、時刻つきの目印を入れます（議事録と、録画の見直しに使えます）。"));
    b.appendChild(list); paint();
}
// 4 ToDo・決定事項
function vTodo(b, call){
    const x = call.x;
    const kind = telxH("select", {class:"telx-sel", "aria-label":"種類"}, telxH("option", {value:"todo", text:"ToDo"}), telxH("option", {value:"decision", text:"決定事項"}));
    const who = telxH("select", {class:"telx-sel", "aria-label":"担当"}, telxH("option", {value:"me", text:"自分"}), telxH("option", {value:"peer", text:"相手"}), telxH("option", {value:"all", text:"みんな"}));
    const inp = telxH("input", {class:"telx-in", type:"text", maxlength:"120", placeholder:"内容", "aria-label":"内容"});
    const list = telxH("ul", {class:"telx-list"});
    const paint = () => {
        list.textContent = "";
        x.todos.forEach((t, i) => {
            const li = telxH("li", {class:t.done ? "done" : ""},
                telxH("input", {type:"checkbox", "aria-label":"できた", checked:t.done ? true : false, onchange:(ev) => { t.done = ev.target.checked; telxPersist(call); paint(); }}),
                telxH("span", {class:"tx"}, t.kind === "decision" ? telxH("b", {text:"【決定】"}) : null, " " + t.text + " （" + telxT({me:"自分", peer:"相手", all:"みんな"}[t.who] || "") + "）"),
                telxH("button", {type:"button", "aria-label":"削除", text:"✕", onclick:() => { x.todos.splice(i, 1); telxPersist(call); paint(); }}));
            list.appendChild(li);
        });
    };
    const add = () => { const v = inp.value.trim(); if(!v) return; x.todos.push({kind:kind.value, who:who.value, text:v.slice(0, 120), done:false, at:telxElapsed(call)}); inp.value = ""; telxPersist(call); paint(); };
    inp.addEventListener("keydown", (ev) => { if(ev.key === "Enter"){ ev.preventDefault(); add(); } });
    b.appendChild(telxH("div", {class:"telx-row"}, kind, who));
    b.appendChild(telxH("div", {class:"telx-row"}, inp, telxBtn("＋ 追加", add, "pri")));
    b.appendChild(list); paint();
}
// 5 タイマー
function telxTmStart(call, sec, fromPeer){
    const x = call.x; x.tm = sec > 0 ? {end:Date.now() + sec * 1000, total:sec, fired:false} : null;
    telxLog(call, sec > 0 ? "timer_start" : "timer_stop", {sec});
    if(!fromPeer && x.tmSync){ try{ if(call.dc && call.dc.readyState === "open") call.dc.send(JSON.stringify({t:"tm", ms:sec * 1000})); }catch(_e){} }
    telxPaintTm(call);
}
function telxPaintTm(call){
    const el = document.getElementById("telxTm"); if(!el) return;
    const x = call && call.x;
    if(!x || !x.tm){ el.hidden = true; return; }
    const left = Math.ceil((x.tm.end - Date.now()) / 1000);
    el.hidden = false; el.classList.toggle("end", left <= 0);
    el.textContent = "⏱ " + (left > 0 ? telxDur(left) : "0:00");
    if(left <= 0 && !x.tm.fired){
        x.tm.fired = true; showToast("時間になりました。");
        try{ telBeep(880, 0, 0.25, 0.3); telBeep(880, 0.4, 0.25, 0.3); telBeep(1175, 0.8, 0.4, 0.3); }catch(_e){}
        try{ navigator.vibrate && navigator.vibrate([300, 150, 300]); }catch(_e){}
        setTimeout(() => { if(call.x && call.x.tm && call.x.tm.fired){ call.x.tm = null; telxPaintTm(call); } }, 8000);
    }
}
function vTimer(b, call){
    const x = call.x;
    const sync = telxH("input", {type:"checkbox", id:"telxTmSync", checked:x.tmSync ? true : false, onchange:(ev) => { x.tmSync = ev.target.checked; }});
    const custom = telxH("input", {class:"telx-in s", type:"number", min:"1", max:"600", inputmode:"numeric", placeholder:"分（1〜600）", "aria-label":"分"});
    const row = telxH("div", {class:"telx-row"});
    [1, 3, 5, 10, 15, 30].forEach((m) => row.appendChild(telxH("button", {type:"button", class:"telx-b", "data-min":String(m), onclick:() => telxTmStart(call, m * 60), text:m + " 分"})));
    b.appendChild(row);
    b.appendChild(telxH("div", {class:"telx-row"}, custom, telxBtn("スタート", () => { const m = Math.floor(Number(custom.value)); if(m >= 1 && m <= 600) telxTmStart(call, m * 60); else showToast("1〜600 分で入れてください。"); }, "pri"), telxBtn("止める", () => telxTmStart(call, 0), "dng")));
    b.appendChild(telxH("label", {class:"telx-p"}, sync, " 相手の画面にも出す"));
    b.appendChild(telxP("残り時間は、画面の右上に出ます。時間になると、音と振動でお知らせします。"));
}
// 6 字幕（文字おこし）
function telxCapSupported(){ return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
function telxCapAdd(call, who, text, at){
    const x = call.x; text = String(text || "").trim().slice(0, 300); if(!text) return;
    x.caps.push({who, text, at:at == null ? telxElapsed(call) : at}); if(x.caps.length > 2000) x.caps.shift();
    const el = document.getElementById("telxCap");
    if(el){ el.hidden = false; el.textContent = ""; el.appendChild(telxH("small", {text:who === "me" ? "自分" : telNameOf(call.room)})); el.appendChild(document.createTextNode(text)); clearTimeout(x.capHide); x.capHide = setTimeout(() => { el.hidden = true; }, 6000); }
    telxPersist(call);
    try{ if(telxUi.view === "cap" && telxUi.live && telxUi.sheet && !telxUi.sheet.hidden) telxUi.live(); }catch(_e){}   // 字幕の画面を開いているとき、すぐ一覧に出す
}
function telxCapStart(call){
    const x = call.x, SR = window.SpeechRecognition || window.webkitSpeechRecognition; if(!SR) return false;
    try{
        const r = new SR(); r.lang = x.capLang; r.continuous = true; r.interimResults = false;
        r.onresult = (ev) => {
            for(let i = ev.resultIndex; i < ev.results.length; i++){
                const res = ev.results[i]; if(!res.isFinal) continue;
                const txt = res[0] && res[0].transcript; if(!txt || call.muted) continue;   // ミュート中の声は、字幕にしない
                telxCapAdd(call, "me", txt);
                try{ if(call.dc && call.dc.readyState === "open") call.dc.send(JSON.stringify({t:"cap", txt:String(txt).trim().slice(0, 300), at:telxElapsed(call)})); }catch(_e){}
            }
        };
        r.onerror = (ev) => { if(ev && (ev.error === "not-allowed" || ev.error === "service-not-allowed")){ x.capOn = false; showToast("この端末では、字幕（音声認識）が許可されていません。"); } };
        r.onend = () => { if(x.capOn && tel.call === call){ try{ r.start(); }catch(_e){} } };
        x.capRec = r; x.capOn = true; r.start(); telxLog(call, "cap_on");
        return true;
    }catch(_e){ x.capOn = false; return false; }
}
function telxCapStop(call){ const x = call.x; x.capOn = false; try{ x.capRec && x.capRec.stop(); }catch(_e){} x.capRec = null; telxLog(call, "cap_off"); }
function vCap(b, call){
    const x = call.x, ok = telxCapSupported();
    const list = telxH("ul", {class:"telx-list"});
    const sel = telxH.apply(null, ["select", {class:"telx-sel", "aria-label":"字幕の言語"}].concat([["ja-JP", "日本語"], ["en-US", "English"], ["zh-CN", "中文（简体）"], ["ko-KR", "한국어"]].map((p) => telxH("option", {value:p[0], text:p[1], selected:x.capLang === p[0] ? true : false}))));
    const btn = telxH("button", {type:"button", class:"telx-b pri", disabled:!ok});
    const paint = () => {
        btn.textContent = x.capOn ? "⏹ 字幕を止める" : "▶ 字幕をはじめる"; btn.classList.toggle("on", x.capOn);
        list.textContent = "";
        x.caps.slice(-40).forEach((c) => list.appendChild(telxH("li", null, telxH("span", {class:"tm", text:telxDur(c.at)}), telxH("span", {class:"tx"}, telxH("b", {text:c.who === "me" ? "自分：" : "相手："}), " " + c.text))));
    };
    btn.addEventListener("click", () => { if(x.capOn) telxCapStop(call); else { x.capLang = sel.value; if(!telxCapStart(call)) showToast("字幕をはじめられませんでした。"); } paint(); });
    sel.addEventListener("change", () => { x.capLang = sel.value; if(x.capOn){ telxCapStop(call); telxCapStart(call); } });
    b.appendChild(telxP(ok ? "自分の声を文字にして、相手の画面にも出します。相手の字幕も、ここに出ます。文字にした内容は、議事録に入ります。" : "このブラウザは、字幕（音声認識）に対応していません（Chrome・Edge・Safari の新しい版で使えます）。", ok ? "" : "telx-warn"));
    b.appendChild(telxP("字幕は、ブラウザの音声認識を使います。端末やブラウザによっては、声が外部のサービスに送られることがあります。"));
    b.appendChild(telxH("div", {class:"telx-row"}, sel, btn));
    b.appendChild(list); paint(); telxUi.live = paint;
}
// 7 スクリーンショット
function telxSnap(call){
    const cv = document.createElement("canvas"); cv.width = 960; cv.height = 540;
    const r = {g:cv.getContext("2d"), cv, meta:{startedAt:call.startAt || Date.now()}};
    telxDraw(call, r);
    return new Promise((resolve) => cv.toBlob(resolve, "image/png"));
}
function vShot(b, call){
    const cnt = telxH("span", {text:String(call.x.shots)});
    b.appendChild(telxP("いまの通話の画面（相手の映像・自分の映像・画面共有）を、画像として保存します。"));
    b.appendChild(telxH("div", {class:"telx-row"}, telxBtn("📸 いまの画面を保存", async () => {
        try{
            const blob = await telxSnap(call); if(!blob){ showToast("保存できませんでした。"); return; }
            const a = telxH("a", {href:URL.createObjectURL(blob), download:"call_shot_" + telxStamp(Date.now()) + ".png"});
            document.body.appendChild(a); a.click(); setTimeout(() => { try{ URL.revokeObjectURL(a.href); a.remove(); }catch(_e){} }, 4000);
            call.x.shots++; cnt.textContent = String(call.x.shots); telxLog(call, "shot");
        }catch(_e){ showToast("保存できませんでした。"); }
    }, "pri")));
    b.appendChild(telxH("p", {class:"telx-p"}, "保存した枚数：", cnt));
}
// 8 通信状況
async function telxStats(call){
    const o = {rtt:null, loss:null, jitter:null, inKbps:null, outKbps:null, type:"", fps:null, res:"", ok:false};
    if(!call.pc) return o;
    const st = await call.pc.getStats(), byId = {}; let pair = null;
    st.forEach((r) => { byId[r.id] = r; });
    st.forEach((r) => { if(r.type === "transport" && r.selectedCandidatePairId) pair = byId[r.selectedCandidatePairId] || pair; });
    if(!pair) st.forEach((r) => { if(r.type === "candidate-pair" && (r.selected || r.nominated) && r.state === "succeeded") pair = pair || r; });
    if(pair){ if(pair.currentRoundTripTime != null) o.rtt = Math.round(pair.currentRoundTripTime * 1000); const lc = byId[pair.localCandidateId]; o.type = lc && lc.candidateType || ""; o.ok = true; }
    let inB = 0, outB = 0, lost = 0, recv = 0;
    st.forEach((r) => {
        if(r.type === "inbound-rtp"){
            inB += r.bytesReceived || 0; lost += r.packetsLost || 0; recv += r.packetsReceived || 0;
            if(r.kind === "audio" && r.jitter != null) o.jitter = Math.round(r.jitter * 1000);
            if(r.kind === "video"){ if(r.framesPerSecond) o.fps = Math.round(r.framesPerSecond); if(r.frameWidth) o.res = r.frameWidth + "×" + r.frameHeight; }
        }
        if(r.type === "outbound-rtp") outB += r.bytesSent || 0;
    });
    const now = Date.now(), p = call.x.prevStats;
    if(p && now > p.t){ const dt = (now - p.t) / 1000; o.inKbps = Math.round((inB - p.inB) * 8 / dt / 1000); o.outKbps = Math.round((outB - p.outB) * 8 / dt / 1000); const dl = lost - p.lost, dr = recv - p.recv; if(dl + dr > 0) o.loss = Math.max(0, Math.round(dl / (dl + dr) * 1000) / 10); }
    call.x.prevStats = {t:now, inB, outB, lost, recv};
    return o;
}
function telxRate(o){
    if(o.rtt == null && o.loss == null) return "";
    if((o.loss != null && o.loss > 8) || (o.rtt != null && o.rtt > 500)) return "bad";
    if((o.loss != null && o.loss > 2) || (o.rtt != null && o.rtt > 250)) return "mid";
    return "good";
}
function vNet(b, call){
    const kv = telxH("div", {class:"telx-kv"}), verdict = telxH("p", {class:"telx-big"});
    b.appendChild(verdict); b.appendChild(kv);
    b.appendChild(telxP("つながりかたの目安です。「悪い」ときは、Wi-Fi とモバイル通信を切りかえたり、カメラを止めたりすると、よくなることがあります。"));
    let busy = false;
    const paint = async () => {
        if(busy) return; busy = true;
        try{
            const o = await telxStats(call); if(telxUi.view !== "net") return;
            const rate = telxRate(o);
            verdict.className = "telx-big " + (rate ? "telx-" + rate : ""); verdict.textContent = rate === "good" ? "🟢 良好" : rate === "mid" ? "🟡 ふつう" : rate === "bad" ? "🔴 悪い" : "計測中…";
            kv.textContent = "";
            const row = (k, v) => { kv.appendChild(telxH("span", {text:k})); kv.appendChild(telxH("b", {text:v})); };
            row("応答の遅れ", o.rtt == null ? "—" : o.rtt + " ms");
            row("声の乱れ（ジッター）", o.jitter == null ? "—" : o.jitter + " ms");
            row("とどかなかった割合", o.loss == null ? "—" : o.loss + " %");
            row("受信", o.inKbps == null ? "—" : o.inKbps + " kbps");
            row("送信", o.outKbps == null ? "—" : o.outKbps + " kbps");
            row("相手の映像", o.res ? o.res + (o.fps ? "  " + o.fps + " fps" : "") : "—");
            row("つなぎかた", o.type === "relay" ? "中継サーバー経由" : o.type ? "直接（P2P）" : "—");
        }catch(_e){ verdict.textContent = "計測できませんでした。"; }
        finally{ busy = false; }
    };
    paint(); telxUi.live = paint;
}
// 9 音声調整
function vAudio(b, call){
    const track = call.stream && call.stream.getAudioTracks()[0];
    const row = telxH("div", {class:"telx-row"});
    b.appendChild(telxP(track ? "マイクの処理を切りかえます。まわりがうるさいときは「ノイズ抑制」、スピーカーの音が相手に返るときは「エコー除去」をオンにします。" : "マイクが使えません。", track ? "" : "telx-warn"));
    b.appendChild(row);
    if(!track) return;
    const defs = [["noiseSuppression", "ノイズ抑制"], ["echoCancellation", "エコー除去"], ["autoGainControl", "自動で音量をそろえる"]];
    const paint = () => {
        row.textContent = "";
        const cur = track.getSettings ? track.getSettings() : {};
        defs.forEach((d) => {
            const on = cur[d[0]] !== false;
            row.appendChild(telxH("button", {type:"button", class:"telx-b" + (on ? " on" : ""), "aria-pressed":on ? "true" : "false", onclick:async () => {
                try{ await track.applyConstraints({[d[0]]:!on}); }catch(_e){ showToast("この端末では、切りかえられません。"); }
                paint();
            }}, telxT(d[1]) + telxColon() + telxT(on ? "オン" : "オフ")));
        });
    };
    paint();
}
// 10 出力先・音量
function vOut(b, call){
    const u = tel.ui, vol = telxH("input", {type:"range", min:"0", max:"100", value:String(Math.round((u.remote.volume == null ? 1 : u.remote.volume) * 100)), "aria-label":"相手の声の音量", class:"telx-in"});
    vol.addEventListener("input", () => { u.remote.volume = Number(vol.value) / 100; });
    b.appendChild(telxP("相手の声の大きさ"));
    b.appendChild(vol);
    const sel = telxH("select", {class:"telx-sel", "aria-label":"音の出力先"});
    const can = typeof u.remote.setSinkId === "function";
    b.appendChild(telxP(can ? "音の出る先（スピーカー・イヤホンなど）" : "このブラウザでは、音の出る先は、端末の設定で切りかえます。", can ? "" : "telx-warn"));
    if(can){
        b.appendChild(sel);
        navigator.mediaDevices.enumerateDevices().then((ds) => {
            const outs = ds.filter((d) => d.kind === "audiooutput");
            sel.textContent = "";
            if(!outs.length){ sel.appendChild(telxH("option", {value:"", text:"（標準）"})); return; }
            outs.forEach((d, i) => sel.appendChild(telxH("option", {value:d.deviceId, text:d.label || ("出力 " + (i + 1)), selected:u.remote.sinkId === d.deviceId ? true : false})));
        }).catch(() => {});
        sel.addEventListener("change", () => { u.remote.setSinkId(sel.value).then(() => showToast("音の出る先を切りかえました。")).catch(() => showToast("切りかえられませんでした。")); });
    }
}
// 11 小窓（ピクチャインピクチャ）
function vPip(b, call){
    const u = tel.ui, ok = !!(document.pictureInPictureEnabled && u.remote.requestPictureInPicture);
    b.appendChild(telxP(ok ? "相手の映像を、ほかのアプリの上に重ねる小さな窓で見ます（相手のカメラ・画面共有があるときに使えます）。" : "このブラウザは、小窓（ピクチャインピクチャ）に対応していません。", ok ? "" : "telx-warn"));
    const on = !!document.pictureInPictureElement;
    b.appendChild(telxH("div", {class:"telx-row"}, telxH("button", {type:"button", class:"telx-b pri", disabled:!ok, text:on ? "小窓をとじる" : "小窓で見る", onclick:async () => {
        try{
            if(document.pictureInPictureElement) await document.exitPictureInPicture();
            else if(call.peerCam || call.peerScr){ await u.remote.requestPictureInPicture(); }
            else showToast("相手の映像がないときは、使えません。");
        }catch(_e){ showToast("小窓にできませんでした。"); }
        telxShow("pip");
    }})));
}
// 12 挙手
function telxPaintHands(call){
    const el = document.getElementById("telxHands"); if(!el) return;
    el.textContent = ""; const x = call && call.x; if(!x) return;
    if(x.hand) el.appendChild(telxH("div", {class:"telx-hand", text:"🙋 自分"}));
    if(x.peerHand) el.appendChild(telxH("div", {class:"telx-hand", text:"🙋 " + telNameOf(call.room)}));
}
function telxSetHand(call, on){
    const x = call.x; x.hand = !!on; telxLog(call, on ? "hand_up" : "hand_down");
    try{ if(call.dc && call.dc.readyState === "open") call.dc.send(JSON.stringify({t:"hand", on:!!on})); }catch(_e){}
    telxPaintHands(call);
}
function vHand(b, call){
    const x = call.x, btn = telxH("button", {type:"button", class:"telx-b pri"});
    const paint = () => { btn.textContent = x.hand ? "🙋 手を下ろす" : "🙋 手を挙げる"; btn.classList.toggle("on", x.hand); };
    btn.addEventListener("click", () => { telxSetHand(call, !x.hand); paint(); });
    b.appendChild(telxP("話したいことがあるときに、手を挙げて知らせます（相手の画面に 🙋 が出ます）。"));
    b.appendChild(telxH("div", {class:"telx-row"}, btn)); paint();
    telxUi.live = () => { paint(); };
}
// 13 議事録
function telxMinutesData(call){
    const x = call.x;
    return {callId:call.id, startedAt:call.startAt || Date.now(), sec:telxElapsed(call), kind:call.kind, role:call.role, partnerName:telNameOf(call.room), uid:(state.user && state.user.id) || "", roomId:call.room ? call.room.id : "",
        notes:x.notes, marks:x.marks.slice(), todos:x.todos.slice(), caps:x.caps.slice(), log:x.log.slice(), recCount:x.parts};
}
function telxLogText(e){
    const m = {rec_start:"録音・録画を開始", rec_resume:"録音・録画を再開", rec_stop_admin:"管理者が録音・録画を止めました", rec_unsupported:"この端末では録音・録画できませんでした", rec_failed:"録音・録画をはじめられませんでした",
        timer_start:"タイマーを開始", timer_stop:"タイマーを止めました", hand_up:"手が挙がりました", hand_down:"手が下りました", shot:"スクリーンショットを保存", cap_on:"字幕をはじめました", cap_off:"字幕を止めました", share_on:"画面共有をはじめました", share_off:"画面共有を止めました"}[e.k];
    return m ? telxT(m) + (e.k === "timer_start" && e.sec ? "（" + Math.round(e.sec / 60) + telxT("分") + "）" : "") : "";
}
/** 議事録の文章（Markdown）。d は telxMinutesData() の形（ページが閉じられたあとでも作れるように、通話そのものは使わない） */
function telxMinutesText(d){
    const L = [];
    const kind = d.kind === "video" ? telxT("ビデオ通話") : telxT("音声通話");
    L.push("# " + telxT("通話の議事録"));
    L.push("");
    L.push("- " + telxT("日時") + ": " + telxDateText(d.startedAt) + " (JST)");
    L.push("- " + telxT("通話時間") + ": " + telxDur(d.sec));
    L.push("- " + telxT("種類") + ": " + kind);
    L.push("- " + telxT("相手") + ": " + (d.partnerName || "-"));
    L.push("- " + telxT("録音・録画") + ": " + (d.recCount ? telxT("あり") : telxT("なし")));
    if(d.notes && d.notes.trim()){ L.push("", "## " + telxT("メモ"), "", d.notes.trim()); }
    const dec = (d.todos || []).filter((t) => t.kind === "decision"), todo = (d.todos || []).filter((t) => t.kind !== "decision");
    const who = (w) => ({me:telxT("自分"), peer:telxT("相手"), all:telxT("みんな")}[w] || "");
    if(dec.length){ L.push("", "## " + telxT("決定事項"), ""); dec.forEach((t) => L.push("- " + t.text + " (" + who(t.who) + ")")); }
    if(todo.length){ L.push("", "## ToDo", ""); todo.forEach((t) => L.push("- [" + (t.done ? "x" : " ") + "] " + t.text + " (" + who(t.who) + ")")); }
    if((d.marks || []).length){ L.push("", "## " + telxT("しおり"), ""); d.marks.forEach((m) => L.push("- " + telxDur(m.at) + " " + (m.label || ""))); }
    if((d.caps || []).length){ L.push("", "## " + telxT("字幕（文字おこし）"), ""); d.caps.forEach((c) => L.push("- [" + telxDur(c.at) + "] " + (c.who === "me" ? telxT("自分") : telxT("相手")) + ": " + c.text)); }
    const ev = (d.log || []).map((e) => ({at:e.at, t:telxLogText(e)})).filter((e) => e.t);
    if(ev.length){ L.push("", "## " + telxT("できごと"), ""); ev.forEach((e) => L.push("- " + telxDur(e.at) + " " + e.t)); }
    L.push("");
    return L.join("\n");
}
function vMin(b, call){
    const ta = telxH("textarea", {class:"telx-ta", readonly:true, "aria-label":telxT("議事録")});
    const refresh = () => { ta.value = telxMinutesText(telxMinutesData(call)); };
    refresh();
    b.appendChild(telxP("メモ・決定事項・ToDo・しおり・字幕をまとめた文章です。通話が終わると、自動でドライブにも保存します。"));
    b.appendChild(telxH("div", {class:"telx-row"}, telxBtn("更新", refresh), telxBtn("📋 コピー", async () => { try{ await navigator.clipboard.writeText(ta.value); showToast("コピーしました。"); }catch(_e){ ta.select(); showToast("選んだ文字をコピーしてください。"); } }),
        telxBtn("💾 ファイルに保存", () => { const blob = new Blob([ta.value], {type:"text/markdown"}); const a = telxH("a", {href:URL.createObjectURL(blob), download:"call_" + telxStamp(call.startAt || Date.now()) + "_minutes.md"}); document.body.appendChild(a); a.click(); setTimeout(() => { try{ URL.revokeObjectURL(a.href); a.remove(); }catch(_e){} }, 4000); }),
        telxBtn("💬 チャットに送る", async () => { try{ await sendPayloadToRoom(call.room.id, {type:"text", text:ta.value}); showToast("チャットに送りました。"); }catch(_e){ showToast("送れませんでした。"); } }, "pri")));
    b.appendChild(ta);
}
function telxHasContent(d){ return !!((d.notes && d.notes.trim()) || (d.marks || []).length || (d.todos || []).length || (d.caps || []).length); }
/** 通話が終わったとき：メモなどがあれば、議事録として この端末に保存して、ドライブへ送る */
async function telxMinutesSave(call){
    const x = call && call.x; if(!x || x.minSaved) return; x.minSaved = true;
    const d = telxMinutesData(call);
    try{ localStorage.removeItem("are_call_x_" + call.id); }catch(_e){}
    if(!telxHasContent(d)) return;
    try{
        await telxPutMeta({id:call.id + "-m", type:"minutes", callId:call.id, part:0, roomId:d.roomId, partnerName:d.partnerName, uid:d.uid, role:d.role, kind:d.kind, startedAt:d.startedAt, sec:d.sec, text:telxMinutesText(d), bytes:0, done:true, uploaded:false, tries:0, mime:"text/markdown"});
        telxQueueUpload(3000);
    }catch(_e){}
}
// 14 画面の見かた
function telxApplyLayout(call){
    const stage = tel.ui && tel.ui.ov.querySelector(".tel-stage"); if(!stage) return;
    stage.classList.remove("telx-L-swap", "telx-L-split");
    if(call.x.layout === "swap") stage.classList.add("telx-L-swap");
    if(call.x.layout === "split") stage.classList.add("telx-L-split");
}
function vLayout(b, call){
    const x = call.x, row = telxH("div", {class:"telx-row"});
    const paint = () => {
        row.textContent = "";
        [["remote", "相手を大きく"], ["swap", "自分を大きく"], ["split", "ならべて表示"]].forEach((o) => row.appendChild(telxH("button", {type:"button", class:"telx-b" + (x.layout === o[0] ? " on" : ""), "aria-pressed":x.layout === o[0] ? "true" : "false", onclick:() => { x.layout = o[0]; telxApplyLayout(call); paint(); }}, o[1])));
    };
    b.appendChild(telxP("映像の並べかたを切りかえます（録画の画面は、いつも「相手を大きく」です）。"));
    b.appendChild(row); paint();
    const fs = !!document.fullscreenElement, can = !!(tel.ui.ov.requestFullscreen);
    b.appendChild(telxH("div", {class:"telx-row"}, telxH("button", {type:"button", class:"telx-b pri", disabled:!can, onclick:async () => { try{ if(document.fullscreenElement) await document.exitFullscreen(); else await tel.ui.ov.requestFullscreen(); }catch(_e){ showToast("全画面にできませんでした。"); } telxShow("layout"); }}, fs ? "全画面をやめる" : "全画面にする")));
    if(!can) b.appendChild(telxP("このブラウザでは、全画面にできません。", "telx-warn"));
}
// 15 ロック・画面を消さない
async function telxWake(call, on){
    const x = call.x; x.wakeOn = on;
    try{
        if(on && navigator.wakeLock && !document.hidden && !x.wake){ x.wake = await navigator.wakeLock.request("screen"); x.wake.addEventListener("release", () => { x.wake = null; }); }
        if(!on && x.wake){ await x.wake.release(); x.wake = null; }
    }catch(_e){}
}
function telxSetLock(call, on){
    call.x.locked = !!on; telxLog(call, on ? "lock_on" : "lock_off");
    const el = document.getElementById("telxLock"); if(el) el.hidden = !on;
    if(on) telxClose();
}
function telxBindUnlock(btn){
    let t0 = 0, raf = 0;
    const bar = () => btn.querySelector("i");
    const stop = () => { t0 = 0; cancelAnimationFrame(raf); if(bar()) bar().style.width = "0"; };
    const step = () => { if(!t0) return; const p = Math.min(1, (Date.now() - t0) / 1200); if(bar()) bar().style.width = (p * 100) + "%"; if(p >= 1){ stop(); if(tel.call && tel.call.x) telxSetLock(tel.call, false); } else raf = requestAnimationFrame(step); };
    const down = (ev) => { ev.preventDefault(); t0 = Date.now(); step(); };
    btn.addEventListener("pointerdown", down); ["pointerup", "pointerleave", "pointercancel"].forEach((n) => btn.addEventListener(n, stop));
    btn.addEventListener("keydown", (ev) => { if(ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); if(tel.call && tel.call.x) telxSetLock(tel.call, false); } });
}
function vLock(b, call){
    const x = call.x, ws = !!navigator.wakeLock;
    b.appendChild(telxP("ロックすると、画面をさわっても ボタンが押せなくなります（ポケットの中での 誤操作よけ）。解除は、画面の下の ボタンを 長押しします。"));
    b.appendChild(telxH("div", {class:"telx-row"}, telxBtn("🔒 画面をロックする", () => telxSetLock(call, true), "pri")));
    const wk = telxH("button", {type:"button", class:"telx-b" + (x.wakeOn && ws ? " on" : ""), disabled:!ws, "aria-pressed":x.wakeOn ? "true" : "false", onclick:async () => { await telxWake(call, !x.wakeOn); telxShow("lock"); }}, ws ? telxT("画面を消さない") + telxColon() + telxT(x.wakeOn ? "オン" : "オフ") : "画面を消さない（この端末は非対応）");
    b.appendChild(telxH("div", {class:"telx-row"}, wk));
    b.appendChild(telxP("通話中は、画面が暗くなったり 消えたりしないようにします（初期設定はオン）。"));
}

// ===== 状態の保存（ページが閉じられても、メモが残るように）=====
function telxPersist(call){
    const x = call && call.x; if(!x) return;
    const now = Date.now(); if(now - x.persistAt < 800) { clearTimeout(x.persistT); x.persistT = setTimeout(() => telxPersist(call), 900); return; }
    x.persistAt = now;
    try{ localStorage.setItem("are_call_x_" + call.id, JSON.stringify(telxMinutesData(call))); }catch(_e){}
}
async function telxRecoverNotes(){
    try{
        const keys = []; for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if(k && k.indexOf("are_call_x_") === 0) keys.push(k); }
        for(const k of keys){
            const id = k.slice("are_call_x_".length);
            if(tel.call && tel.call.id === id) continue;
            let d = null; try{ d = JSON.parse(localStorage.getItem(k)); }catch(_e){}
            localStorage.removeItem(k);
            if(!d || !d.uid || !telxHasContent(d)) continue;
            await telxPutMeta({id:id + "-m", type:"minutes", callId:id, part:0, roomId:d.roomId || "", partnerName:d.partnerName || "", uid:d.uid, role:d.role || "x", kind:d.kind || "audio", startedAt:d.startedAt || Date.now(), sec:d.sec || 0, text:telxMinutesText(d), bytes:0, done:true, uploaded:false, tries:0, mime:"text/markdown", recovered:true});
        }
    }catch(_e){}
}

// ===== chat-call.js から呼ばれる =====
function telxOpen(call){
    call.x = call.x || telxNew();
    telxBuild();
    const note = document.getElementById("telxNote"); if(note) note.hidden = false;
    telxPaintRec(call); telxPaintHands(call); telxPaintTm(call); telxApplyLayout(call);
    telxClose();
}
function telxLive(call){
    const x = call.x; if(!x) return;
    const note = document.getElementById("telxNote"); if(note) note.hidden = true;
    telxRecStart(call, "live");               // つながったら、自動で録音・録画をはじめる
    telxWake(call, true);
    x.tick = setInterval(() => {
        const t = document.getElementById("telxRecT"); if(t && x.rec) t.textContent = telxDur((Date.now() - x.rec.meta.startedAt) / 1000);
        telxPaintTm(call);
        if(telxUi.live && telxUi.sheet && !telxUi.sheet.hidden){ try{ telxUi.live(); }catch(_e){} }
    }, 1000);
    document.addEventListener("visibilitychange", telxVis);
}
function telxVis(){ const c = tel.call; if(c && c.x && !document.hidden && c.x.wakeOn) telxWake(c, true); }
function telxEnd(call){
    const x = call && call.x; if(!x) return;
    clearInterval(x.tick); clearTimeout(x.capHide); clearTimeout(x.persistT);
    document.removeEventListener("visibilitychange", telxVis);
    try{ if(x.capOn) telxCapStop(call); }catch(_e){}
    try{ if(x.wake) x.wake.release(); }catch(_e){} x.wake = null;
    try{ if(document.fullscreenElement) document.exitFullscreen(); }catch(_e){}
    try{ if(document.pictureInPictureElement) document.exitPictureInPicture(); }catch(_e){}
    const lock = document.getElementById("telxLock"); if(lock) lock.hidden = true;
    const stage = tel.ui && tel.ui.ov.querySelector(".tel-stage"); if(stage) stage.classList.remove("telx-L-swap", "telx-L-split");
    telxClose();
    ["telxCap", "telxTm", "telxRec"].forEach((id) => { const e = document.getElementById(id); if(e) e.hidden = true; });
    const hands = document.getElementById("telxHands"); if(hands) hands.textContent = "";
    if(x.rec){ telxRecStop(call, "end"); }     // 録画の最後まで保存してから、議事録もまとめて保存（telxFinalize）
    else telxMinutesSave(call);
}
function telxMsg(call, m){
    if(!call.x || !m) return;
    if(m.t === "rec") telxRecMsg(call, m);
    else if(m.t === "hand"){ call.x.peerHand = !!m.on; telxPaintHands(call); if(m.on) showToast(telNameOf(call.room) + " が手を挙げています。"); }
    else if(m.t === "tm"){ const ms = Number(m.ms) || 0; call.x.tm = ms > 0 && ms <= 36000000 ? {end:Date.now() + ms, total:Math.round(ms / 1000), fired:false} : null; telxPaintTm(call); }
    else if(m.t === "cap" && typeof m.txt === "string") telxCapAdd(call, "peer", m.txt, Number(m.at) || undefined);
}
/** 着信の画面に「録音・録画されます」を出す */
function telxIncoming(u){
    try{
        telxCss();
        let n = u.inc.querySelector(".telx-recnote");
        if(!n){ n = telxH("small", {class:"telx-recnote", text:"この通話は、つながると自動で録音・録画されます。"}); const acts = u.inc.querySelector(".acts"); u.inc.insertBefore(n, acts || null); }
    }catch(_e){}
}
function telxInit(){
    try{
        const it = document.getElementById("telRecItem");
        if(it) it.addEventListener("click", telxOpenViewer);
        telxRecover(); telxRecoverNotes();
        window.addEventListener("online", () => telxQueueUpload(1500));
        window.addEventListener("pagehide", () => { const c = tel.call; if(c && c.x && c.x.rec){ try{ c.x.rec.mr.requestData(); }catch(_e){} telxPersist(c); } });
        window.AREtelx = {feats:TELX_FEATS.map((f) => f.id), minutesText:telxMinutesText, minutesData:telxMinutesData, canStop:telxCanStopRec, viewer:telxOpenViewer, allMeta:telxAllMeta, blobOf:telxBlobOf, upload:telxQueueUpload, supported:telxSupported};
    }catch(_e){}
}
