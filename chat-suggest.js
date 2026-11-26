"use strict";
// ===== 予測変換（自分専用）：メッセージを打つとき、入力欄の上に「続きの候補」を出す =====
// ・候補のもと：①自分が送った言葉（この端末で覚える）／②自分で取り込んだ「検索履歴ファイル」（Google・YouTube の Takeout など）。
// ・ぜんぶ この端末の中だけ（アカウントごとの localStorage）。サーバーにも、ほかの人にも、AIにも 送りません。候補は 自分の入力欄にしか出ません。
// ・ブラウザの履歴そのものは 読めません（ブラウザの決まり）。ファイルは「自分で選んで取り込む」ときだけ 読みます。
// ・区分「家庭（家族）」の人には この機能は出さず、覚えも しません（chat-segments.js の区分けを つかいます）。
// ・候補を 長押し（パソコンは 右クリック）すると その候補を消せます。「⌨️ 予測変換」から 取り込み・全部消す・ひとつずつ消す ができます。

const SG_OWN_MAX = 1500, SG_IMP_MAX = 3000, SG_SHOW = 5, SG_FILE_MAX = 60 * 1024 * 1024;
const sg = {data:null, uid:"", timer:null, composing:false, hideT:null, pressT:null, pressed:false};

function sgAllowed(){
    try{
        const f = typeof segSt !== "undefined" ? segSt.flags : null;
        if(!f || f.provisional) return false;   // 区分が まだ わからない
        if(f.restricted) return false;          // 家庭（家族）は 除外
        return !!(state && state.user);
    }catch(_e){ return false; }
}
function sgKey(){ return "are_sugg_v1_" + (state.user ? state.user.id : "x"); }
function sgLoad(){
    const uid = state.user ? state.user.id : "x";
    if(sg.data && sg.uid === uid) return sg.data;
    let d = null;
    try{ d = JSON.parse(localStorage.getItem(sgKey()) || "null"); }catch(_e){ d = null; }
    if(!d || typeof d !== "object") d = {};
    d.on = d.on !== false; d.useImp = d.useImp !== false;
    if(!d.own || typeof d.own !== "object") d.own = {};
    if(!d.imp || typeof d.imp !== "object") d.imp = {};
    sg.data = d; sg.uid = uid; return d;
}
function sgSave(){ try{ localStorage.setItem(sgKey(), JSON.stringify(sg.data)); }catch(_e){ showToast("保存できませんでした（ブラウザの保存容量がいっぱいかもしれません）。"); } }

// ---------- 文字の整え ----------
const SG_SPLIT = /[\s、。，．,.!！?？「」『』（）()\[\]【】<>＜＞"“”'’‘…・:：;；/／\\|｜~〜]+/;
function sgOkPhrase(p){
    if(!p || p.length < 2 || p.length > 40) return false;
    if(/https?:|www\.|@|\d{6,}/i.test(p)) return false;       // URL・メール・長い数字（電話番号など）は 覚えない
    if(/^[\d\s\-+.,:/]+$/.test(p)) return false;               // 数字だけ
    return true;
}
function sgWords(text){
    const out = new Set();
    String(text || "").split(/\n+/).forEach((line) => {
        line.split(SG_SPLIT).forEach((chunk) => {
            if(sgOkPhrase(chunk)) out.add(chunk);
        });
        if(typeof Intl !== "undefined" && Intl.Segmenter){
            try{
                const segs = [...new Intl.Segmenter("ja", {granularity:"word"}).segment(line)].map((x) => ({t:x.segment, w:x.isWordLike}));
                segs.forEach((x, i) => {
                    if(!x.w) return;
                    if(sgOkPhrase(x.t)) out.add(x.t);
                    // 文の途中からでも続きが出るように、「この単語から 2〜3語ぶん」も 覚える（例：キャンプに行く）
                    let acc = x.t;
                    for(let k = i + 1, n = 1; k < segs.length && n < 3; k++){
                        if(/^[\s、。，．,.!！?？「」『』（）()\[\]【】<>＜＞"“”'’‘…:：;；/／\\|｜]+$/.test(segs[k].t)) break;
                        acc += segs[k].t; if(segs[k].w) n++;
                        if(acc.length > 24) break;
                        if(sgOkPhrase(acc)) out.add(acc);
                    }
                });
            }catch(_e){ /* 分けられなければ そのまま */ }
        }
    });
    return [...out].slice(0, 40);
}

// ---------- 覚える（自分が送った言葉）----------
function sgLearn(text){
    if(!sgAllowed()) return;
    const d = sgLoad(); if(!d.on) return;
    const now = Date.now();
    sgWords(text).forEach((w) => { const c = d.own[w]; d.own[w] = [(c ? c[0] : 0) + 1, now]; });
    const keys = Object.keys(d.own);
    if(keys.length > SG_OWN_MAX) keys.sort((a, b) => (d.own[a][0] - d.own[b][0]) || (d.own[a][1] - d.own[b][1])).slice(0, keys.length - SG_OWN_MAX + 100).forEach((k) => { delete d.own[k]; });
    sgSave();
}

// ---------- 候補を出す ----------
function sgFragment(){
    const inp = el.messageInput; if(!inp) return null;
    const pos = inp.selectionStart;
    if(typeof pos !== "number" || pos !== inp.selectionEnd) return null;
    const before = inp.value.slice(0, pos);
    const m = before.match(/[^\s、。，．,.!！?？「」『』（）()\[\]【】<>＜＞"“”'’‘…:：;；/／\\|｜]*$/);
    const frag = m ? m[0] : "";
    if(!frag) return null;
    if(/^[\x00-\x7f]+$/.test(frag) && frag.length < 2) return null;   // 英数字は 2文字から
    return {frag, start:pos - frag.length, end:pos};
}
function sgCandidates(frag){
    const d = sgLoad(), low = frag.toLowerCase(), now = Date.now(), seen = new Map();
    const add = (p, s) => { if(p.toLowerCase().startsWith(low) && p.length > frag.length) seen.set(p, Math.max(seen.get(p) || 0, s)); };
    Object.keys(d.own).forEach((p) => { const c = d.own[p]; add(p, c[0] * 2 + Math.max(0, 3 - (now - c[1]) / 86400000 / 10)); });
    if(d.useImp) Object.keys(d.imp).forEach((p) => add(p, d.imp[p]));
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, SG_SHOW).map((x) => x[0]);
}
function sgBar(){
    let bar = document.getElementById("sgBar");
    if(!bar){
        const bottom = document.querySelector(".composer .composer-bottom"); if(!bottom) return null;
        bar = document.createElement("div"); bar.id = "sgBar"; bar.className = "sg-bar"; bar.hidden = true;
        bar.setAttribute("role", "listbox"); bar.setAttribute("aria-label", "予測変換の候補");
        bottom.insertAdjacentElement("beforebegin", bar);
        sgCss();
        bar.addEventListener("pointerdown", (e) => { e.preventDefault(); const b = e.target.closest("[data-sg]"); if(!b) return;   // 入力欄から フォーカスを はずさない
            sg.pressed = false; clearTimeout(sg.pressT);
            sg.pressT = setTimeout(() => { sg.pressed = true; sgForget(b.dataset.sg); }, 650);   // 長押しで その候補を消す
        });
        bar.addEventListener("pointerup", (e) => { clearTimeout(sg.pressT); const b = e.target.closest("[data-sg]"); if(b && !sg.pressed) sgApply(b.dataset.sg); });
        bar.addEventListener("pointerleave", () => clearTimeout(sg.pressT));
        bar.addEventListener("contextmenu", (e) => { const b = e.target.closest("[data-sg]"); if(b){ e.preventDefault(); clearTimeout(sg.pressT); sgForget(b.dataset.sg); } });
    }
    return bar;
}
function sgCss(){
    if(document.getElementById("sgCss")) return;
    const s = document.createElement("style"); s.id = "sgCss";
    s.textContent = ".sg-bar{display:flex;gap:6px;overflow-x:auto;padding:2px 2px 4px;scrollbar-width:none}.sg-bar::-webkit-scrollbar{display:none}.sg-bar[hidden]{display:none}" +
        ".sg-chip{flex:0 0 auto;max-width:70vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:5px 12px;border-radius:16px;border:1px solid rgba(127,127,127,.4);background:rgba(127,127,127,.14);color:inherit;font-size:14px;cursor:pointer;touch-action:manipulation}";
    document.head.appendChild(s);
}
function sgUpdate(){
    const bar = sgBar(); if(!bar) return;
    clearTimeout(sg.hideT);
    if(!sgAllowed() || !sgLoad().on || sg.composing || document.activeElement !== el.messageInput){ bar.hidden = true; return; }
    const f = sgFragment();
    const list = f ? sgCandidates(f.frag) : [];
    if(!list.length){ bar.hidden = true; return; }
    bar.innerHTML = list.map((p) => '<button type="button" class="sg-chip" role="option" data-sg="' + escapeHtml(p) + '">' + escapeHtml(p) + "</button>").join("");
    bar.hidden = false;
}
function sgSoon(){ clearTimeout(sg.timer); sg.timer = setTimeout(sgUpdate, 80); }
function sgApply(phrase){
    const inp = el.messageInput, f = sgFragment(); if(!f || !phrase) return;
    inp.value = inp.value.slice(0, f.start) + phrase + inp.value.slice(f.end);
    const pos = f.start + phrase.length; inp.setSelectionRange(pos, pos); inp.focus();
    inp.dispatchEvent(new Event("input", {bubbles:true}));
    sgUpdate();
}
function sgForget(phrase){
    sg.pressed = true;
    if(!window.confirm("「" + phrase + "」を 予測変換の候補から消しますか？（この端末の中だけの 記録です）")) return;
    const d = sgLoad(); delete d.own[phrase]; delete d.imp[phrase]; sgSave(); sgUpdate(); showToast("候補から消しました。");
}

// ---------- 取り込み（Takeout など。この端末の中だけで読む）----------
function sgPhraseFromUrl(u){
    try{
        const url = new URL(u);
        const q = url.searchParams.get("q") || url.searchParams.get("search_query");
        return q ? q.replace(/\s+/g, " ").trim() : "";
    }catch(_e){ return ""; }
}
function sgFromTitle(t){
    t = String(t || "").trim();
    let m = t.match(/^「(.+)」を検索しました$/) || t.match(/^(.+?)\s*を検索しました$/) || t.match(/^Searched for\s+(.+)$/i);
    return m ? m[1].trim() : "";
}
function sgExtract(name, text){
    const out = [];
    const lower = name.toLowerCase();
    if(lower.endsWith(".json")){
        let arr = null; try{ arr = JSON.parse(text); }catch(_e){ arr = null; }
        if(Array.isArray(arr)) arr.forEach((it) => {
            if(!it || typeof it !== "object") return;
            const p = sgPhraseFromUrl(it.titleUrl || "") || sgFromTitle(it.title);
            if(p) out.push(p);
        });
    }else if(/\.html?$/.test(lower)){
        const doc = new DOMParser().parseFromString(text, "text/html");
        doc.querySelectorAll('a[href*="q="], a[href*="search_query="]').forEach((a) => { const p = sgPhraseFromUrl(a.getAttribute("href") || ""); if(p) out.push(p); });
    }else{   // txt・csv：1行に1つ（CSVは 先頭の列）
        text.split(/\r?\n/).forEach((line) => { let p = line.split(",")[0].replace(/^["']|["']$/g, "").trim(); if(p) out.push(p); });
    }
    return out;
}
async function sgImportFiles(files){
    if(!sgAllowed()) return;
    const d = sgLoad(); let total = 0, kept = 0, skipped = 0;
    for(const f of files){
        if(f.size > SG_FILE_MAX){ skipped++; continue; }
        let text = ""; try{ text = await f.text(); }catch(_e){ skipped++; continue; }
        sgExtract(f.name, text).forEach((p) => { total++; if(sgOkPhrase(p)){ d.imp[p] = (d.imp[p] || 0) + 1; kept++; } });
    }
    const keys = Object.keys(d.imp);
    if(keys.length > SG_IMP_MAX) keys.sort((a, b) => d.imp[b] - d.imp[a]).slice(SG_IMP_MAX).forEach((k) => { delete d.imp[k]; });
    d.impAt = Date.now(); sgSave();
    showToast("取り込みました：検索 " + total + " 件のうち、候補に使うもの " + kept + " 件" + (skipped ? "（読めなかったファイル " + skipped + "）" : "") + "。");
    sgRenderMain();
}

// ---------- 画面 ----------
function openSuggest(){
    if(!sgAllowed()){ showToast("この機能は、いまのアカウントでは つかえません。"); return; }
    sgRenderMain();
}
function sgRenderMain(filter){
    const d = sgLoad();
    const nOwn = Object.keys(d.own).length, nImp = Object.keys(d.imp).length;
    const q = typeof filter === "string" ? filter : "";
    const impList = Object.keys(d.imp).filter((p) => !q || p.toLowerCase().includes(q.toLowerCase())).sort((a, b) => d.imp[b] - d.imp[a]).slice(0, 40);
    openSheet(toolHead("⌨️ 予測変換（自分専用）", "メッセージを打つとき、入力欄の上に 続きの候補を出します。ぜんぶ この端末の中だけです。") +
        '<label class="me-toggle"><input type="checkbox" id="sgOn"' + (d.on ? " checked" : "") + '> 予測変換を つかう（オフにすると 覚えも 出しも しません）</label>' +
        '<label class="me-toggle"><input type="checkbox" id="sgUseImp"' + (d.useImp ? " checked" : "") + '> 取り込んだ検索履歴も 候補に つかう</label>' +
        '<div class="meta">覚えた言葉：自分が送った分 ' + nOwn + ' 件／取り込んだ検索 ' + nImp + ' 件。候補を 長押し（パソコンは 右クリック）しても 消せます。</div>' +
        '<div class="admin-card"><b>🔎 検索履歴を 取り込む</b><div class="meta">ブラウザの履歴そのものは 読めないので、Google の「データ エクスポート（Takeout）」で 自分の検索履歴を ダウンロードして、そのファイルを ここで選びます（JSON・HTML・文字ファイル）。ファイルは この端末の中で読むだけで、どこにも 送られません。<br>手順：takeout.google.com → 「マイ アクティビティ」だけ選ぶ（検索・YouTube）→ 形式は JSON → ダウンロードして 解凍 → 「MyActivity.json」を 選ぶ。</div>' +
        '<input type="file" id="sgFile" accept=".json,.html,.htm,.txt,.csv" multiple></div>' +
        '<div class="row"><button type="button" class="button-secondary" data-t="suggest:clearimp">取り込んだ検索を ぜんぶ消す</button><button type="button" class="button-secondary" data-t="suggest:clearown">自分の送信から覚えた分を 消す</button></div>' +
        (nImp ? '<input class="search" id="sgFilter" type="search" placeholder="🔍 取り込んだ検索を さがして 消す" value="' + escapeHtml(q) + '" autocomplete="off">' +
            '<div class="sg-list">' + impList.map((p) => '<div class="qk-row"><span class="qk-name" style="flex:1;word-break:break-all">' + escapeHtml(p) + '</span><button type="button" class="button-secondary qk-mini" data-t="suggest:del" data-p="' + escapeHtml(p) + '" aria-label="消す">✕</button></div>').join("") + (nImp > impList.length ? '<div class="meta">（上位 ' + impList.length + ' 件だけ表示。さがすと ほかも 出ます）</div>' : "") + "</div>" : "") +
        '<div class="row"><button type="button" class="button" data-pm="close">閉じる</button></div>');
}
function onSuggestAction(act, node){
    if(!sgAllowed()) return;
    const d = sgLoad();
    if(act === "clearimp"){ if(!window.confirm("取り込んだ検索履歴を ぜんぶ消しますか？")) return; d.imp = {}; sgSave(); sgRenderMain(); showToast("消しました。"); }
    else if(act === "clearown"){ if(!window.confirm("自分の送信から覚えた言葉を ぜんぶ消しますか？")) return; d.own = {}; sgSave(); sgRenderMain(); showToast("消しました。"); }
    else if(act === "del"){ delete d.imp[node.dataset.p]; sgSave(); const f = document.getElementById("sgFilter"); sgRenderMain(f ? f.value : ""); }
}

function sgSyncEntrance(){
    const t = document.querySelector('[data-tool="suggest"]');
    if(t) t.style.display = sgAllowed() ? "" : "none";
    if(!sgAllowed()){ const bar = document.getElementById("sgBar"); if(bar) bar.hidden = true; }
}
function initSuggest(){
    registerTool("suggest", onSuggestAction);
    const inp = el.messageInput;
    if(inp){
        ["input", "click", "keyup", "focus"].forEach((t) => inp.addEventListener(t, sgSoon));
        inp.addEventListener("compositionstart", () => { sg.composing = true; const b = document.getElementById("sgBar"); if(b) b.hidden = true; });
        inp.addEventListener("compositionend", () => { sg.composing = false; sgSoon(); });
        inp.addEventListener("blur", () => { sg.hideT = setTimeout(() => { const b = document.getElementById("sgBar"); if(b) b.hidden = true; }, 200); });
    }
    // 送った言葉を覚える（文字のメッセージが 送られるとき）
    if(typeof sendMessagePayload === "function"){
        const orig = sendMessagePayload;
        sendMessagePayload = function(payload){
            try{ if(payload && payload.type === "text" && typeof payload.text === "string") sgLearn(payload.text); }catch(_e){ /* 覚えられなくても 送る */ }
            return orig.apply(this, arguments);
        };
    }
    el.profileModal.addEventListener("change", (e) => {
        if(e.target.id === "sgFile" && e.target.files && e.target.files.length) sgImportFiles([...e.target.files]);
        else if(e.target.id === "sgOn"){ sgLoad().on = e.target.checked; sgSave(); }
        else if(e.target.id === "sgUseImp"){ sgLoad().useImp = e.target.checked; sgSave(); }
    });
    el.profileModal.addEventListener("input", (e) => { if(e.target.id === "sgFilter") sgRenderMain(e.target.value); });
    sgSyncEntrance();
    feat.timers.push(setInterval(sgSyncEntrance, 2500));
}
