"use strict";
// ===== カスタマイズAIbot（自分専用）=====
// ・入口：いちばん上のショートカットバーの「6つ目（🤖）」（はじめから入っています）と、「その他」の ツール。
// ・つかえる人：管理者・家庭（家族）・社員・友人。区分「その他」の人には 出さず、動きません（chat-segments.js の区分けを つかいます）。
//     区分が まだ わからない間（読み込み前・読み込み失敗）も 出しません（安全がわに たおす）。
// ・ひとりひとり 別々：記録・せってい・GASのURL・合言葉は、アカウントごとに この端末へ 別々に 保存します。
// ・ほかの人の情報は 一切 入りません：
//     この機能は、チャット（部屋・メッセージ・ユーザー一覧・プロフィール）を 読みません。
//     AIに送るのは「このbotの 画面で あなたが 打った 文章」と「キャラ設定」だけです。
// ・AIとの やりとりは あなたの Google Apps Script（GAS「AIbot」）だけを 通ります。Supabase には 何も 保存しません。
//     APIキーは GAS の「スクリプト プロパティ」にだけ 入れます。この ファイル・GitHub・ブラウザには 書きません。
// ・GASの URL と 合言葉は、この端末のブラウザ（localStorage）にだけ 保存します（GitHub には 置きません）。
// ・会話の きろくは、この端末のブラウザにだけ 保存します（「きろくを消す」で 消せます）。

const AIB_MAX_SAVE = 80, AIB_SEND_LAST = 12, AIB_MAX_INPUT = 1500, AIB_MAX_PERSONA = 800;
const AIB_DEFAULT_PERSONA = "あなたは「カスタマイズAIbot」。持ち主だけの、気さくで やさしい 日本語の 相棒です。くだけた 話し言葉で、短めに（3〜5文）答えてください。わからないことは わからないと言い、むりに 作り話をしません。";
const AIB_TONES = [
    ["気さくな相棒", AIB_DEFAULT_PERSONA],
    ["ていねいな先生", "あなたは「カスタマイズAIbot」。ていねいで わかりやすい 先生です。むずかしい ことは たとえ話で 説明し、最後に ひとこと 確認の 質問をします。です・ます調で、短めに。"],
    ["おだやかな聞き役", "あなたは「カスタマイズAIbot」。おだやかな 聞き役です。まず 気持ちを うけとめてから、短く 返します。説教や 決めつけは しません。"],
    ["元気なコーチ", "あなたは「カスタマイズAIbot」。明るく 元気な コーチです。小さな 一歩を ほめて、次に やることを 1つだけ 提案します。短く、前向きに。"]
];

feat.aib = {busy:false, uid:"", shared:null, sharedTried:false, hist:[], cfg:{url:"", token:"", persona:AIB_DEFAULT_PERSONA, name:"カスタマイズAIbot"}, loaded:false};

/** つかってよい人か：管理者／家庭／社員／友人。区分「その他」・区分が不明のあいだは false */
function aibAllowed(){
    try{
        const f = typeof segSt !== "undefined" ? segSt.flags : null;
        if(!f || f.provisional) return false;           // 区分が まだ わからない
        if(f.other) return false;                       // 区分「その他」
        return true;
    }catch(_e){ return false; }
}
function aibUid(){ return state.user ? state.user.id : "x"; }
function aibCfgKey(){ return "are_aibot_cfg_" + aibUid(); }
function aibHistKey(){ return "are_aibot_hist_" + aibUid(); }

function aibLoad(){
    const a = feat.aib;
    try{
        const c = JSON.parse(localStorage.getItem(aibCfgKey()) || "{}") || {};
        a.cfg.url = typeof c.url === "string" ? c.url.trim() : "";
        a.cfg.token = typeof c.token === "string" ? c.token : "";
        a.cfg.persona = typeof c.persona === "string" && c.persona.trim() ? c.persona.slice(0, AIB_MAX_PERSONA) : AIB_DEFAULT_PERSONA;
        a.cfg.name = typeof c.name === "string" && c.name.trim() ? c.name.trim().slice(0, 20) : "カスタマイズAIbot";
        const h = JSON.parse(localStorage.getItem(aibHistKey()) || "[]");
        a.hist = Array.isArray(h) ? h.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-AIB_MAX_SAVE) : [];
    }catch(_e){ a.hist = []; }
    a.loaded = true; a.uid = aibUid();
}
/** アカウントが かわったら、そのアカウントの きろくを 読みなおす（ほかの人の きろくが 見えないように） */
function aibEnsure(){ if(!feat.aib.loaded || feat.aib.uid !== aibUid()){ feat.aib.busy = false; feat.aib.shared = null; feat.aib.sharedTried = false; aibLoad(); } }
function aibSaveCfg(){ try{ localStorage.setItem(aibCfgKey(), JSON.stringify(feat.aib.cfg)); }catch(_e){ showToast("保存できませんでした（ブラウザの保存容量がいっぱいかもしれません）。"); } }
function aibSaveHist(){ try{ localStorage.setItem(aibHistKey(), JSON.stringify(feat.aib.hist.slice(-AIB_MAX_SAVE))); }catch(_e){ /* 続行 */ } }

/** 共通の設定（URL・合言葉）を サーバーから受け取る。区分「その他」には サーバーが渡さない。メモリにだけ置き、端末には 保存しない */
async function aibLoadShared(){
    const a = feat.aib;
    if(a.shared || a.sharedTried && a.sharedUid === aibUid()) return;
    if(a.sharedBusy) return;
    a.sharedBusy = true;
    try{
        const r = await requireClient().rpc("my_aibot_config");
        if(!r.error){                                   // 答えが返った（渡さない人には null）。通信しっぱいのときは、あとで もういちど ためす
            a.sharedTried = true; a.sharedUid = aibUid();
            if(r.data && aibUrlOk(r.data.url) && typeof r.data.token === "string" && r.data.token) a.shared = {url:r.data.url, token:r.data.token};
        }
    }catch(_e){ /* 通信しっぱい：自分の設定だけで つかう */ }
    a.sharedBusy = false;
}
/** いま つかう URL と 合言葉（自分で入れたものが あれば それ。なければ 共通の設定） */
function aibConn(){
    const a = feat.aib;
    if(aibUrlOk(a.cfg.url) && a.cfg.token) return {url:a.cfg.url.trim(), token:a.cfg.token, own:true};
    if(a.shared) return {url:a.shared.url, token:a.shared.token, own:false};
    return null;
}

/** GAS の URL か（https://script.google.com/macros/s/…/exec の形だけ ゆるす） */
function aibUrlOk(u){ return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(String(u || "").trim()); }

// ---------- 入口（ピン止め・ツール）----------
function initAiBot(){
    registerTool("aibot", onAiBotAction);
    ensureAibotCss();
    const sync = () => aibotSyncEntrances();
    sync();
    feat.timers.push(setInterval(sync, 2500));   // 管理者かどうかが わかってから 出す／出さない
}

function aibotSyncEntrances(){
    const show = aibAllowed();
    const old = document.getElementById("aibotPin"); if(old) old.remove();   // 以前の「チャット一覧の上のカード」は もう出さない（ショートカットの6つ目に入っています）
    const tool = document.querySelector('[data-tool="aibot"]');
    if(tool){ tool.style.display = show ? "" : "none"; }
    if(show && !feat.aib.shared && !feat.aib.sharedTried) aibLoadShared();
    if(typeof qkPaintBar === "function") qkPaintBar();   // ショートカットの 6つ目の出し入れ
}
function aibName(){ return feat.aib.cfg.name || "カスタマイズAIbot"; }

function ensureAibotCss(){
    if(document.getElementById("aibotCss")) return;
    const s = document.createElement("style"); s.id = "aibotCss";
    s.textContent = ".aib-pin{width:100%;text-align:left;margin:6px 0;border:2px solid #ffb84a;background:linear-gradient(135deg,rgba(255,184,74,.18),rgba(255,122,74,.12))}" +
        ".aib-log{max-height:46vh;min-height:140px;overflow:auto;display:flex;flex-direction:column;gap:6px;padding:6px 2px}" +
        ".aib-msg{max-width:86%;padding:8px 12px;border-radius:14px;white-space:pre-wrap;word-break:break-word;line-height:1.5}" +
        ".aib-msg.user{align-self:flex-end;background:var(--accent,#2f6df6);color:#fff;border-bottom-right-radius:4px}" +
        ".aib-msg.assistant{align-self:flex-start;background:rgba(127,127,127,.18);border-bottom-left-radius:4px}" +
        ".aib-msg.note{align-self:center;font-size:.85em;opacity:.75;background:none}" +
        ".aib-in{width:100%;min-height:54px;resize:vertical}";
    document.head.appendChild(s);
}

// ---------- 画面 ----------
function openAiBot(){
    if(!aibAllowed()){ showToast("この機能は、いまのアカウントでは つかえません。"); return; }
    aibEnsure();
    aibRenderMain();
    if(!aibConn()) aibLoadShared().then(() => { if(aibConn() && document.getElementById("aibLog") && !el.profileModal.hidden) aibRenderMain(); });
}
function aibRenderMain(){
    const a = feat.aib, ready = !!aibConn();
    openSheet(toolHead("🤖 " + escapeHtml(aibName()), "自分専用。ここで 打った 文章だけが AI に 送られます（ほかの人の 会話・情報は 送りません）。") +
        (ready ? "" : '<div class="meta" style="color:#ff9a4a">⚠ じゅんび中です。少し まってから もういちど ひらくか、「⚙ せってい」で 自分の GAS の URL と 合言葉を 入れてください。</div>') +
        '<div class="aib-log" id="aibLog" aria-live="polite"></div>' +
        '<textarea id="aibIn" class="aib-in" maxlength="' + AIB_MAX_INPUT + '" placeholder="ここに 書いて「送る」（Ctrl+Enter でも 送れます）"></textarea>' +
        '<div class="row"><button type="button" class="button" id="aibSend" data-t="aibot:send">送る</button>' +
        '<button type="button" class="button-secondary" data-t="aibot:settings">⚙ せってい</button>' +
        '<button type="button" class="button-secondary" data-t="aibot:clear">🗑 きろくを消す</button>' +
        '<button type="button" class="button-secondary" data-pm="close">閉じる</button></div>');
    const log = document.getElementById("aibLog");
    if(!a.hist.length) aibAppend("note", "なんでも 話しかけてね。キャラ設定は「⚙ せってい」で 変えられます。");
    a.hist.forEach((m) => aibAppend(m.role, m.content));
    const inp = document.getElementById("aibIn");
    inp.addEventListener("keydown", (e) => { if(e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.isComposing){ e.preventDefault(); aibSend(); } });
    log.scrollTop = log.scrollHeight;
}
function aibAppend(role, text){
    const log = document.getElementById("aibLog"); if(!log) return null;
    const d = document.createElement("div"); d.className = "aib-msg " + role; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
}

function aibRenderSettings(){
    const c = feat.aib.cfg;
    openSheet(toolHead("⚙ " + escapeHtml(aibName()) + " の せってい", "ここに 入れた 内容は、この端末の ブラウザにだけ 保存されます。") +
        '<div class="meta">' + (feat.aib.shared ? "✅ 共通の じゅんびが できています。URL と 合言葉は、自分の GAS を つかいたいときだけ 入れます（空なら 共通のものを つかいます）。" : "URL と 合言葉を 入れてください。") + "</div>" +
        '<label for="aibName">bot の 名前（20文字まで）</label><input id="aibName" type="text" maxlength="20" value="' + escapeHtml(c.name) + '">' +
        '<label for="aibUrl">GAS の URL（…/exec で おわるもの）</label><input id="aibUrl" type="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" value="' + escapeHtml(c.url) + '">' +
        '<label for="aibToken">合言葉（GAS の APP_TOKEN と おなじもの）</label><input id="aibToken" type="password" autocomplete="off" value="' + escapeHtml(c.token) + '">' +
        '<label for="aibTone">キャラ（ひな形）</label><select id="aibTone" data-t="aibot:tone"><option value="">えらぶと 下の 欄に 入ります</option>' + AIB_TONES.map((t, i) => '<option value="' + i + '">' + escapeHtml(t[0]) + "</option>").join("") + "</select>" +
        '<label for="aibPersona">キャラ設定（' + AIB_MAX_PERSONA + '文字まで。自由に 書きかえられます）</label><textarea id="aibPersona" rows="6" maxlength="' + AIB_MAX_PERSONA + '">' + escapeHtml(c.persona) + "</textarea>" +
        '<div class="row"><button type="button" class="button-secondary" data-t="aibot:back">もどる</button><button type="button" class="button" data-t="aibot:save">保存</button></div>');
}

// ---------- 動作 ----------
function onAiBotAction(act, node){
    if(!aibAllowed()) return;
    aibEnsure();
    if(act === "open") openAiBot();
    else if(act === "send") aibSend();
    else if(act === "settings") aibRenderSettings();
    else if(act === "back") aibRenderMain();
    else if(act === "tone"){ const i = parseInt(node.value, 10); if(AIB_TONES[i]) document.getElementById("aibPersona").value = AIB_TONES[i][1]; }
    else if(act === "save"){
        const c = feat.aib.cfg, url = document.getElementById("aibUrl").value.trim();
        if(url && !aibUrlOk(url)){ showToast("URL が 違うようです。https://script.google.com/macros/s/…/exec の 形で 入れてください。"); return; }
        c.name = document.getElementById("aibName").value.trim().slice(0, 20) || "カスタマイズAIbot";
        c.url = url; c.token = document.getElementById("aibToken").value;
        if((c.url && !c.token) || (!c.url && c.token)){ showToast("自分の GAS を つかうときは、URL と 合言葉の 両方を 入れてください（どちらも空なら 共通のものを つかいます）。"); return; }
        c.persona = document.getElementById("aibPersona").value.trim().slice(0, AIB_MAX_PERSONA) || AIB_DEFAULT_PERSONA;
        aibSaveCfg(); aibotSyncEntrances(); showToast("保存しました。"); aibRenderMain();
    }
    else if(act === "clear"){
        if(!window.confirm("このbotとの きろくを ぜんぶ 消しますか？（この端末の中だけの きろくです）")) return;
        feat.aib.hist = []; aibSaveHist(); aibRenderMain(); showToast("きろくを 消しました。");
    }
}

async function aibSend(){
    const a = feat.aib, inp = document.getElementById("aibIn"); if(!inp || a.busy) return;
    const text = inp.value.trim(); if(!text) return;
    let conn = aibConn();
    if(!conn){ await aibLoadShared(); conn = aibConn(); }
    if(!conn){ showToast("まだ じゅんびが できていません。少し まってから もういちど。または「⚙ せってい」で 入れてください。"); return; }
    a.busy = true; const btn = document.getElementById("aibSend"); if(btn) btn.disabled = true;
    inp.value = ""; aibAppend("user", text); a.hist.push({role:"user", content:text}); aibSaveHist();
    const wait = aibAppend("assistant", "…考え中…");
    // 送るのは「このbotの画面の会話（さいごの数件）」と「キャラ設定」だけ。チャットの部屋・ほかの人の情報は 一切 入れない。
    const body = {token:conn.token, system:a.cfg.persona, messages:a.hist.slice(-AIB_SEND_LAST).map((m) => ({role:m.role, content:m.content.slice(0, AIB_MAX_INPUT)}))};
    let reply = "", failed = "";
    try{
        const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 45000);
        const res = await fetch(conn.url, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify(body), redirect:"follow", credentials:"omit", referrerPolicy:"no-referrer", signal:ctl.signal});
        clearTimeout(timer);
        const j = await res.json();
        if(j && j.ok && typeof j.reply === "string") reply = j.reply;
        else failed = aibErrText(j && j.code, j && j.error);
    }catch(error){ failed = error && error.name === "AbortError" ? "時間がかかりすぎました。もういちど 送ってみてください。" : "GAS に つながりませんでした。URL・公開の せってい（アクセスできるユーザー：全員）・ネットを 確認してください。"; }
    a.busy = false; const b2 = document.getElementById("aibSend"); if(b2) b2.disabled = false;
    if(failed){ if(wait){ wait.className = "aib-msg note"; wait.textContent = "⚠ " + failed; } a.hist.pop(); aibSaveHist(); return; }
    if(wait) wait.textContent = reply;
    a.hist.push({role:"assistant", content:reply.slice(0, 4000)}); aibSaveHist();
    const log = document.getElementById("aibLog"); if(log) log.scrollTop = log.scrollHeight;
}
function aibErrText(code, msg){
    if(code === "auth") return "合言葉が ちがいます。「⚙ せってい」を 見なおしてください。";
    if(code === "limit") return "きょうの 回数の 上限に なりました（無料の 範囲を まもるため）。あした また つかえます。";
    if(code === "setup") return "GAS 側の じゅんびが たりません（スクリプト プロパティに XAI_API_KEY と APP_TOKEN を 入れてください）。";
    if(code === "upstream") return "AI（Grok）側で エラーが 出ました。少し まって もういちど。" + (msg ? "（" + String(msg).slice(0, 80) + "）" : "");
    if(code === "input") return "送る 文章が 長すぎる、または 空です。";
    return "うまく いきませんでした。" + (msg ? "（" + String(msg).slice(0, 80) + "）" : "");
}
