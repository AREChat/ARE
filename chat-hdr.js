"use strict";
// ===== 上のバー（ARE のロゴの右がわ）：タブごとのボタン ＋「アプリとして追加」📲 =====
// ・ログアウトは「マイページ」だけに出します（ふだんは ほとんど使わないため）。
// ・チャット：📖 マニュアル／更新／📲 アプリ追加　　ユーザー：検索欄／更新　　投稿：更新　　その他：🔍 機能を検索　　マイページ：ログアウト
// ・ボタンの実体は、もとの場所から ここへ「移した」だけです。押したときの動きは 今までと同じです。
//   （もとの場所に 作られるボタン〈操作方法・機能を検索〉は、作られたあとで ここへ移します）
// ・📲 は、Android の Chrome／パソコンの Chrome・Edge ではワンクリックでインストール。
//   iPhone／iPad は Apple の決まりで、ボタン1つでは追加できないため、「共有 →『ホーム画面に追加』」の手順を案内します。
const hdrSt = {tries:0, timer:0, help:false, more:false};

function hdrIsIos(){ return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)); }
function hdrIsStandalone(){
    try{ return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: window-controls-overlay)").matches || navigator.standalone === true; }catch(_e){ return false; }
}

/** あとから作られるボタン（操作方法・機能を検索）を、上のバーへ うつす。まだ無ければ、少し待って もう一度 */
function hdrPlace(){
    if(!hdrSt.help){
        const a = document.getElementById("segHelpLink"), slot = document.querySelector(".ba-chats");
        if(a && slot){
            a.className = "button-secondary hdr-btn hdr-help"; a.textContent = "📖 マニュアル"; a.title = "マニュアル（使い方ガイドを開く）";
            slot.insertAdjacentElement("afterbegin", a); hdrSt.help = true;
        }
    }
    if(!hdrSt.more){
        const inp = document.getElementById("moreSearch"), slot = document.querySelector(".ba-more");
        if(inp && slot){
            const wrap = inp.closest(".more-search");
            inp.placeholder = "🔍 機能を検索"; inp.title = "「その他」の機能を名前で探す（例：家計 / ゲーム / てんき）"; inp.setAttribute("aria-label", "機能を検索（その他）");
            slot.appendChild(inp); if(wrap) wrap.classList.add("hdr-moved"); hdrSt.more = true;
        }
    }
    if(hdrSt.help && hdrSt.more){ clearInterval(hdrSt.timer); hdrSt.timer = 0; }
    else if(++hdrSt.tries > 60){ clearInterval(hdrSt.timer); hdrSt.timer = 0; }   // 30秒たっても無ければ あきらめる（今までの場所のまま 使える）
}

// ---------- 📲 アプリとして追加 ----------
function hdrInstallPaint(){
    // チャットタブの上のバーの 📲 は出さない（持ち主の指示 2026-11-23）。「その他」→ 操作方法の となりの「📲 アプリとして追加」だけに出す
    const b = document.getElementById("installAppButton"); if(b) b.hidden = true;
    const it = document.getElementById("installAppItem"); if(it) it.hidden = hdrIsStandalone();
}
function hdrPlatform(){
    const ua = navigator.userAgent;
    if(hdrIsIos()) return "ios";
    if(/Android/i.test(ua)) return /Firefox/i.test(ua) ? "android-firefox" : "android";
    if(/Edg\//.test(ua)) return "edge";
    if(/Firefox/i.test(ua)) return "firefox";
    if(/Chrome|Chromium/.test(ua)) return "chrome";
    if(/Safari/i.test(ua) && /Macintosh/.test(ua)) return "safari-mac";
    return "other";
}
function hdrGuideHtml(kind){
    const li = (arr) => '<ol class="hdr-steps">' + arr.map((t) => "<li>" + t + "</li>").join("") + "</ol>";
    const G = {
        ios: ["📲 iPhone・iPad に追加する", li(["画面の下（iPad は上）の <b>「共有」ボタン</b>（四角から矢印が出ているマーク）をタップ", "<b>「ホーム画面に追加」</b>をタップ（見つからないときは、メニューを下へスクロール）", "右上の <b>「追加」</b>をタップ"]) +
            '<div class="meta">ホーム画面に「ARE」のアイコンができます。そこから開くと、アプリのように全画面で使えて、通知も受け取れます。</div><div class="meta">※ iPhone・iPad は Apple の決まりで、ボタン1つでは追加できません（上の3つの手順が必要です）。Safari で開くのがいちばん確実です。</div>'],
        android: ["📲 Android に追加する", li(["ブラウザ（Chrome など）の右上の <b>メニュー（︙）</b>をタップ", "<b>「アプリをインストール」</b>または<b>「ホーム画面に追加」</b>をタップ", "<b>「インストール」</b>（または「追加」）をタップ"]) +
            '<div class="meta">もしメニューに出てこないときは、Chrome で開き直してから、もう一度ためしてください。</div>'],
        "android-firefox": ["📲 Android（Firefox）に追加する", li(["右上の <b>メニュー（︙）</b>をタップ", "<b>「インストール」</b>をタップ"]) + '<div class="meta">出てこないときは、Chrome で開くと、ボタン1つで追加できます。</div>'],
        chrome: ["📲 パソコン（Chrome）に追加する", li(["アドレスバーの右はしの <b>「インストール」マーク</b>（画面に下向き矢印のアイコン）をクリック", "<b>「インストール」</b>をクリック"]) +
            '<div class="meta">マークが見つからないときは、右上のメニュー（︙）→「キャスト、保存、共有」→「ページをアプリとしてインストール」を選んでください。デスクトップとスタートメニューに「ARE」ができます。</div>'],
        edge: ["📲 パソコン（Edge）に追加する", li(["右上の <b>メニュー（…）</b>をクリック", "<b>「アプリ」</b> → <b>「このサイトをアプリとしてインストール」</b>をクリック", "<b>「インストール」</b>をクリック"])],
        "safari-mac": ["📲 Mac（Safari）に追加する", li(["画面上の <b>「ファイル」</b>メニューをクリック", "<b>「Dock に追加」</b>をクリック"])],
        firefox: ["📲 パソコンで追加するには", '<div class="meta">Firefox（パソコン版）には、アプリとして追加する機能がありません。<b>Chrome または Edge</b> で開くと、ワンクリックで追加できます。</div>'],
        other: ["📲 アプリとして追加する", '<div class="meta">お使いのブラウザのメニューから「アプリをインストール」「ホーム画面に追加」を探してください。<br>Android・パソコンは <b>Chrome または Edge</b>、iPhone・iPad は <b>Safari</b> がおすすめです。</div>']
    };
    const g = G[kind] || G.other;
    return '<div id="hdrInstallSheet"><h3 style="margin:0">' + g[0] + '</h3>' + g[1] + '<div class="row"><button type="button" class="button-secondary" data-pm="close">閉じる</button></div></div>';
}
async function hdrInstallClick(){
    const ev = window.__areInstallEvent || (typeof feat !== "undefined" && feat.push && feat.push.installEvent) || null;
    if(ev){
        // ワンクリックでインストール（Android の Chrome／パソコンの Chrome・Edge）
        try{
            ev.prompt();
            const r = await ev.userChoice;
            window.__areInstallEvent = null; if(typeof feat !== "undefined" && feat.push) feat.push.installEvent = null;
            if(r && r.outcome === "accepted"){ showToast("アプリとして追加しました。ホーム画面（パソコンはデスクトップ）の「ARE」から開けます。"); hdrInstallPaint(); }
            return;
        }catch(_e){ /* 一度使った合図などで失敗したら、手順の案内を出す */ }
    }
    openSheet(hdrGuideHtml(hdrPlatform()));
}

/** スマホ幅：会話の上の小さなボタン（画面サイズ・検索・ブロック・通知・名前変更など）は 最初は隠して、「⋯」で出す */
function hdrInitDots(){
    const head = document.querySelector(".chat-header"), person = head && head.querySelector(".person-text");
    if(!head || !person || document.getElementById("hdrMoreBtn")) return;
    const b = document.createElement("button");
    b.type = "button"; b.id = "hdrMoreBtn"; b.className = "button-secondary hdr-dots"; b.textContent = "⋯";
    b.title = "そのほかのボタン（画面サイズ・検索・名前変更など）"; b.setAttribute("aria-label", "そのほかのボタンを出す・かくす"); b.setAttribute("aria-expanded", "false");
    person.insertAdjacentElement("afterend", b);
    const set = (on) => { head.classList.toggle("hdr-open", on); b.setAttribute("aria-expanded", on ? "true" : "false"); };
    b.addEventListener("click", () => set(!head.classList.contains("hdr-open")));
    // 別の相手のチャットを開いたら、また かくす
    const t = document.getElementById("chatTitle");
    if(t && window.MutationObserver) new MutationObserver(() => set(false)).observe(t, {childList: true, characterData: true, subtree: true});
}

function initHdr(){
    hdrInitDots();
    const css = document.createElement("style");
    css.textContent = "#hdrInstallSheet .hdr-steps{margin:10px 0 6px;padding-left:22px;line-height:1.7}#hdrInstallSheet .hdr-steps li{margin:4px 0}#hdrInstallSheet .meta{margin:6px 0}";
    document.head.appendChild(css);
    const b = document.getElementById("installAppButton"), it = document.getElementById("installAppItem");
    if(it) it.addEventListener("click", () => runTool ? runTool(hdrInstallClick) : hdrInstallClick());
    if(b || it){
        if(b) b.addEventListener("click", () => runTool ? runTool(hdrInstallClick) : hdrInstallClick());
        hdrInstallPaint();
        try{ window.matchMedia("(display-mode: standalone)").addEventListener("change", hdrInstallPaint); }catch(_e){ /* 古いブラウザ */ }
        window.addEventListener("are-installed", hdrInstallPaint);
        window.addEventListener("appinstalled", hdrInstallPaint);
        // 早取りした合図を、通知の設定画面（chat-push.js）とも 共有する
        if(window.__areInstallEvent && typeof feat !== "undefined" && feat.push && !feat.push.installEvent) feat.push.installEvent = window.__areInstallEvent;
        window.addEventListener("are-install-ready", () => { if(typeof feat !== "undefined" && feat.push && !feat.push.installEvent) feat.push.installEvent = window.__areInstallEvent; });
    }
    hdrPlace();
    if(!(hdrSt.help && hdrSt.more)) hdrSt.timer = setInterval(hdrPlace, 500);
}
