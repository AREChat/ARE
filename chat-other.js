"use strict";
// ===== 区分「その他」専用の厳重対策（画面側） =====
// ・サーバー側（sql/other_privacy_v1.sql）が「その他」の人の不正を見つけると my_ui_flags().virus が true になる
//   → この画面が「ウイルス画面」を全面に出す（送信もサーバー側で止まっている）。管理者が解除するまで消えない。
// ・画面から見つけた禁止操作（権限エラー・管理者用の操作・隔離されている相手への操作）も、自分の分だけサーバーに報告する。
//   誤検知が出た場合の非常口：  update private.other_guard_cfg set client_reports = false;
// ・管理者に送れる残り回数の案内、回数制限・保護モードのエラー文（4言語）
// ・ほかの区分（家庭・社員・友人）の人には、何も出ません（flags.other が null）。

const OTHER_TXT = {
    ja: {
        title: "⚠ ウイルスを検出しました", lead: "不正な操作を検知したため、このアカウントを保護モードにしました。",
        log: ["不正アクセスの痕跡を確認しています…", "操作の記録を保存しました", "管理者へ通知しました", "メッセージの送信を停止しました", "保護モードを維持しています…"],
        note: "これは、アプリの不正操作対策による表示です。お使いの端末にウイルスは入っていません。解除については管理者にお問い合わせください。",
        recheck: "もう一度確認する", logout: "ログアウト", checking: "確認しています…", still: "まだ保護モードです。",
        left: "管理者に送れるメッセージは、あと{n}通です", leftZero: "管理者に送れるメッセージは、上限に達しました",
        eAdmin: "管理者に送れるメッセージは5通までです。上限に達しました。", eUser: "ほかの相手には、1通までしか送れません。", eVirus: "保護モード中のため、送信できません。管理者にお問い合わせください。"
    },
    en: {
        title: "⚠ Virus detected", lead: "Suspicious activity was detected, so this account has been put into protected mode.",
        log: ["Checking for traces of unauthorized access…", "The activity was recorded", "The administrator was notified", "Sending messages has been stopped", "Keeping protected mode on…"],
        note: "This screen is shown by the app's abuse protection. No virus is installed on your device. Please contact the administrator to have it lifted.",
        recheck: "Check again", logout: "Log out", checking: "Checking…", still: "Still in protected mode.",
        left: "You can send {n} more message(s) to the administrator", leftZero: "You have reached the limit of messages to the administrator",
        eAdmin: "You can send up to 5 messages to the administrator. The limit has been reached.", eUser: "You can only send 1 message to other people.", eVirus: "You cannot send messages while in protected mode. Please contact the administrator."
    },
    zh: {
        title: "⚠ 检测到病毒", lead: "检测到异常操作，此账号已进入保护模式。",
        log: ["正在检查非法访问的痕迹…", "已保存操作记录", "已通知管理员", "已停止发送消息", "正在保持保护模式…"],
        note: "此画面由应用的防滥用功能显示。您的设备中没有病毒。如需解除，请联系管理员。",
        recheck: "重新确认", logout: "退出登录", checking: "正在确认…", still: "仍处于保护模式。",
        left: "您还可以向管理员发送 {n} 条消息", leftZero: "向管理员发送消息的次数已达上限",
        eAdmin: "最多只能向管理员发送 5 条消息，已达上限。", eUser: "对其他人最多只能发送 1 条消息。", eVirus: "保护模式中无法发送消息。请联系管理员。"
    },
    ko: {
        title: "⚠ 바이러스가 감지되었습니다", lead: "비정상적인 조작이 감지되어 이 계정을 보호 모드로 전환했습니다.",
        log: ["부정 접근의 흔적을 확인하는 중…", "조작 기록을 저장했습니다", "관리자에게 알렸습니다", "메시지 전송을 중지했습니다", "보호 모드를 유지하는 중…"],
        note: "이 화면은 앱의 부정 조작 방지 기능으로 표시됩니다. 사용 중인 기기에는 바이러스가 없습니다. 해제는 관리자에게 문의해 주세요.",
        recheck: "다시 확인", logout: "로그아웃", checking: "확인 중…", still: "아직 보호 모드입니다.",
        left: "관리자에게 보낼 수 있는 메시지가 {n}개 남았습니다", leftZero: "관리자에게 보낼 수 있는 메시지 한도에 도달했습니다",
        eAdmin: "관리자에게는 최대 5개까지 보낼 수 있습니다. 한도에 도달했습니다.", eUser: "다른 사람에게는 1개까지만 보낼 수 있습니다.", eVirus: "보호 모드 중에는 메시지를 보낼 수 없습니다. 관리자에게 문의해 주세요."
    }
};
const otherSt = { hooked:false, soonT:0, recheckT:0, reporting:false, shown:false };

function otherLang(){
    let l = "ja";
    try{ l = (typeof prefGet === "function" ? prefGet("are_lang", "ja") : "ja") || "ja"; }catch(_e){}
    return OTHER_TXT[l] ? l : "ja";
}
function otherT(){ return OTHER_TXT[otherLang()]; }

/** 「その他」の人か（管理者・システムは含まない。サーバーが flags.other を返した人だけ） */
function otherActive(){
    const f = typeof segSt === "object" && segSt ? segSt.flags : null;
    return !!(f && f.other && !f.is_admin && typeof state === "object" && state && state.user);
}

function otherErrText(message){
    const t = otherT(), m = String(message || "");
    if(/other_limit_admin/.test(m)) return t.eAdmin;
    if(/other_limit_user/.test(m)) return t.eUser;
    if(/virus_locked/.test(m)) return t.eVirus;
    return "";
}

function otherCss(){
    if(document.getElementById("otherCss")) return;
    const s = document.createElement("style"); s.id = "otherCss";
    s.textContent =
        "#otherVirus{position:fixed;inset:0;z-index:2147483647;width:100%;height:100%;max-width:none;max-height:none;margin:0;border:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px 16px;box-sizing:border-box;" +
        "background:radial-gradient(ellipse at center,#3a0000 0%,#150000 60%,#080000 100%);color:#ffdede;text-align:center;overflow:auto;font-family:system-ui,-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif}" +
        "#otherVirus:not([open]):not(div){display:none}#otherVirus::backdrop{background:#000}" +
        "#otherVirus::before{content:'';position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,0,0,.07) 0 2px,transparent 2px 5px)}" +
        "#otherVirus .ov-icon{font-size:clamp(64px,22vw,120px);line-height:1;filter:drop-shadow(0 0 18px #ff2a2a);animation:ovShake .35s infinite}" +
        "#otherVirus h1{margin:0;font-size:clamp(22px,6.4vw,38px);color:#ff4d4d;text-shadow:0 0 14px #ff0000;letter-spacing:.04em;animation:ovBlink 1.1s steps(2,end) infinite}" +
        "#otherVirus .ov-lead{max-width:34em;font-size:clamp(14px,3.8vw,18px);line-height:1.6;font-weight:700}" +
        "#otherVirus .ov-log{width:min(34em,100%);text-align:left;font:13px/1.9 ui-monospace,Menlo,Consolas,monospace;color:#ff9c9c;background:rgba(0,0,0,.55);border:1px solid #7a1010;border-radius:10px;padding:10px 14px;box-sizing:border-box}" +
        "#otherVirus .ov-log div::before{content:'> ';color:#ff4d4d}" +
        "#otherVirus .ov-bar{width:min(34em,100%);height:10px;border-radius:6px;background:#2a0000;border:1px solid #7a1010;overflow:hidden}" +
        "#otherVirus .ov-bar i{display:block;height:100%;width:40%;background:linear-gradient(90deg,#ff1a1a,#ff8a8a);animation:ovBar 1.6s ease-in-out infinite alternate}" +
        "#otherVirus .ov-note{max-width:36em;font-size:12px;line-height:1.7;color:#d9a3a3}" +
        "#otherVirus .ov-msg{min-height:1.4em;font-size:13px;color:#ffb3b3}" +
        "#otherVirus .ov-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}" +
        "#otherVirus button{min-height:46px;min-width:150px;padding:10px 18px;border-radius:12px;font-size:16px;font-weight:800;border:1px solid #ff6a6a;background:#2a0505;color:#ffdede;cursor:pointer}" +
        "#otherVirus button:disabled{opacity:.6}" +
        "@keyframes ovShake{0%{transform:translate(0,0) rotate(0)}25%{transform:translate(-3px,2px) rotate(-2deg)}50%{transform:translate(3px,-2px) rotate(2deg)}75%{transform:translate(-2px,-3px) rotate(-1deg)}100%{transform:translate(0,0) rotate(0)}}" +
        "@keyframes ovBlink{50%{opacity:.55}}@keyframes ovBar{from{margin-left:0}to{margin-left:60%}}" +
        "#otherVirus canvas.ov-rain{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:.5}" +
        "#otherVirus>*:not(canvas):not(.ov-stripe){position:relative;z-index:1}" +
        "#otherVirus .ov-stripe{position:absolute;left:0;right:0;height:16px;z-index:2;background:repeating-linear-gradient(45deg,#ffd400 0 14px,#150000 14px 28px);background-size:40px 40px;animation:ovStripe 1.2s linear infinite;box-shadow:0 0 22px rgba(255,0,0,.8)}" +
        "#otherVirus .ov-stripe.t{top:0}#otherVirus .ov-stripe.b{bottom:0;animation-direction:reverse}" +
        "#otherVirus::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:2;box-shadow:inset 0 0 140px 20px rgba(255,0,0,.55);animation:ovPulse 1.3s ease-in-out infinite}" +
        "#otherVirus h1{position:relative}" +
        "#otherVirus h1::before,#otherVirus h1::after{content:attr(data-t);position:absolute;left:0;right:0;top:0;pointer-events:none}" +
        "#otherVirus h1::before{color:#00e5ff;mix-blend-mode:screen;transform:translate(-3px,0);animation:ovGlitchA 2.2s steps(1,end) infinite}" +
        "#otherVirus h1::after{color:#ff00a0;mix-blend-mode:screen;transform:translate(3px,0);animation:ovGlitchB 2.2s steps(1,end) infinite}" +
        "#otherVirus .ov-log div{opacity:0;animation:ovLine .5s ease-out forwards}" +
        "#otherVirus .ov-log div:nth-child(1){animation-delay:.2s}#otherVirus .ov-log div:nth-child(2){animation-delay:.9s}#otherVirus .ov-log div:nth-child(3){animation-delay:1.6s}#otherVirus .ov-log div:nth-child(4){animation-delay:2.3s}#otherVirus .ov-log div:nth-child(5){animation-delay:3s}" +
        "@keyframes ovStripe{from{background-position:0 0}to{background-position:40px 0}}" +
        "@keyframes ovPulse{0%,100%{opacity:.35}50%{opacity:1}}" +
        "@keyframes ovLine{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}" +
        "@keyframes ovGlitchA{0%{clip-path:inset(0 0 85% 0)}8%{clip-path:inset(40% 0 30% 0)}16%{clip-path:inset(70% 0 5% 0)}24%,100%{clip-path:inset(0 0 100% 0)}}" +
        "@keyframes ovGlitchB{0%{clip-path:inset(60% 0 20% 0)}8%{clip-path:inset(10% 0 70% 0)}16%{clip-path:inset(30% 0 40% 0)}24%,100%{clip-path:inset(0 0 100% 0)}}" +
        "@media (prefers-reduced-motion:reduce){#otherVirus .ov-icon,#otherVirus h1,#otherVirus .ov-bar i,#otherVirus .ov-stripe,#otherVirus::after,#otherVirus h1::before,#otherVirus h1::after{animation:none}#otherVirus .ov-log div{opacity:1;animation:none}#otherVirus canvas.ov-rain{display:none}}" +
        "#otherLimitNote{margin:8px 0;padding:8px 12px;border-radius:12px;font-size:13px;font-weight:700;text-align:center;background:rgba(120,120,120,.14)}";
    document.head.appendChild(s);
}

function otherMk(tag, cls, text){
    const n = document.createElement(tag); if(cls) n.className = cls; if(text != null) n.textContent = text; return n;
}

function otherShowVirus(){
    otherCss();
    const t = otherT();
    let box = document.getElementById("otherVirus");
    if(box) box.remove();
    // <dialog>＋showModal() は、ブラウザの「いちばん手前の層」に出る。ほかの全面ダイアログ（アプリ化のお願い等）が重なっても、必ず上に来る
    const canModal = typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal === "function";
    box = otherMk(canModal ? "dialog" : "div"); box.id = "otherVirus"; box.setAttribute("role", "alertdialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-live", "assertive");
    box.setAttribute("lang", otherLang() === "zh" ? "zh-CN" : otherLang());
    const rain = otherMk("canvas", "ov-rain"); box.appendChild(rain);
    box.appendChild(otherMk("div", "ov-stripe t")); box.appendChild(otherMk("div", "ov-stripe b"));
    box.appendChild(otherMk("div", "ov-icon", "☣"));
    const h1 = otherMk("h1", "", t.title); h1.setAttribute("data-t", t.title); box.appendChild(h1);
    box.appendChild(otherMk("div", "ov-lead", t.lead));
    const bar = otherMk("div", "ov-bar"); bar.appendChild(otherMk("i")); box.appendChild(bar);
    const log = otherMk("div", "ov-log"); t.log.forEach((x) => log.appendChild(otherMk("div", "", x))); box.appendChild(log);
    box.appendChild(otherMk("div", "ov-note", t.note));
    const msg = otherMk("div", "ov-msg"); msg.id = "otherVirusMsg"; box.appendChild(msg);
    const row = otherMk("div", "ov-row");
    const b1 = otherMk("button", "", t.recheck); b1.type = "button"; b1.id = "otherVirusRecheck";
    const b2 = otherMk("button", "", t.logout); b2.type = "button";
    row.appendChild(b1); row.appendChild(b2); box.appendChild(row);
    document.body.appendChild(box);
    if(canModal){
        box.addEventListener("cancel", (ev) => ev.preventDefault());                       // Esc では閉じさせない
        box.addEventListener("close", () => { if(otherSt.shown && box.isConnected){ try{ box.showModal(); }catch(_e){} } });
        try{ box.showModal(); }catch(_e){ box.setAttribute("open", ""); }
    }else{
        // 古いブラウザ：うしろの画面は触れない・タブキーでも行けないようにする
        Array.prototype.forEach.call(document.body.children, (c) => { if(c !== box && c.tagName !== "SCRIPT" && c.tagName !== "STYLE"){ try{ c.setAttribute("inert", ""); c.dataset.otherInert = "1"; }catch(_e){} } });
    }
    document.documentElement.style.overflow = "hidden";
    otherSt.shown = true;
    otherRain(rain);
    b1.addEventListener("click", async () => {
        b1.disabled = true; msg.textContent = t.checking;
        try{ await segLoadFlags(); }catch(_e){}
        if(!(segSt.flags && segSt.flags.virus)){ otherAfterFlags(); return; }
        msg.textContent = t.still; b1.disabled = false;
    });
    b2.addEventListener("click", async () => {
        b2.disabled = true;
        try{ await window.AREAuth.logout(); }catch(_e){ /* 失敗しても、読み込み直す */ }
        location.reload();
    });
    try{ b1.focus(); }catch(_e){}
    clearInterval(otherSt.recheckT);
    otherSt.recheckT = setInterval(async () => {          // 管理者が解除したら、自然に元の画面へ戻る
        if(document.hidden) return;
        try{ await segLoadFlags(); }catch(_e){}
        if(!(segSt.flags && segSt.flags.virus)) otherAfterFlags();
    }, 60000);
}

/** 赤い文字の雨（0と1とHEXだけ。30fps・非表示の間は止まる・動きを減らす設定のときは出さない） */
function otherRain(cv){
    try{
        if(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const ctx = cv.getContext("2d"); if(!ctx) return;
        const chars = "01ABCDEF▮▯"; let cols = 0, drops = [], last = 0;
        const fit = () => { cv.width = cv.clientWidth || window.innerWidth; cv.height = cv.clientHeight || window.innerHeight; cols = Math.ceil(cv.width / 16); drops = Array.from({length: cols}, () => Math.random() * -40); };
        fit(); window.addEventListener("resize", fit);
        const tick = (now) => {
            if(!cv.isConnected){ window.removeEventListener("resize", fit); return; }
            requestAnimationFrame(tick);
            if(document.hidden || now - last < 33) return; last = now;
            ctx.fillStyle = "rgba(20,0,0,.16)"; ctx.fillRect(0, 0, cv.width, cv.height);
            ctx.font = "14px ui-monospace,Menlo,Consolas,monospace";
            for(let i = 0; i < cols; i++){
                const ch = chars[(Math.random() * chars.length) | 0];
                ctx.fillStyle = Math.random() < .06 ? "#ffd0d0" : "#ff2a2a";
                ctx.fillText(ch, i * 16, drops[i] * 16);
                if(drops[i] * 16 > cv.height && Math.random() > .975) drops[i] = 0;
                drops[i] += 1;
            }
        };
        requestAnimationFrame(tick);
    }catch(_e){ /* 雨が出なくても、警告画面は出る */ }
}

function otherHideVirus(){
    const box = document.getElementById("otherVirus");
    otherSt.shown = false;
    if(box){ try{ if(typeof box.close === "function") box.close(); }catch(_e){} box.remove(); }
    document.querySelectorAll("[data-other-inert]").forEach((c) => { c.removeAttribute("inert"); delete c.dataset.otherInert; });
    document.documentElement.style.overflow = "";
    clearInterval(otherSt.recheckT);
    otherSt.shown = false;
}

/** 管理者へ送れる残り回数の案内（「その他」の人だけ） */
function otherPaintLimit(){
    const f = segSt && segSt.flags;
    let note = document.getElementById("otherLimitNote");
    if(!otherActive() || !f.other || typeof f.other.admin_left !== "number"){ if(note) note.remove(); return; }
    const pane = document.querySelector(".pane-chats"); if(!pane) return;
    otherCss();
    const t = otherT();
    if(!note){ note = otherMk("div"); note.id = "otherLimitNote"; const head = pane.querySelector(".section-heading"); if(head) head.insertAdjacentElement("afterend", note); else pane.prepend(note); }
    note.textContent = f.other.admin_left > 0 ? t.left.replace("{n}", String(f.other.admin_left)) : t.leftZero;
}

/** サーバーの答え（my_ui_flags）が分かるたびに呼ぶ */
function otherAfterFlags(){
    const f = segSt && segSt.flags;
    if(f && f.virus === true && f.other){ if(!otherSt.shown) otherShowVirus(); return; }
    if(otherSt.shown) otherHideVirus();
    otherPaintLimit();
}

function otherSoon(){
    clearTimeout(otherSt.soonT);
    otherSt.soonT = setTimeout(async () => {
        if(!otherActive()) return;
        try{ await segLoadFlags(); otherAfterFlags(); }catch(_e){}
    }, 700);
}

function otherKind(type, path){
    const p = String(path || "").toLowerCase().replace(/[^a-z0-9_./-]/g, "").slice(0, 40);
    return type + (p ? ":" + p : "");
}

async function otherReport(kind){
    if(otherSt.reporting || !otherActive() || (segSt.flags && segSt.flags.virus)) return;
    otherSt.reporting = true;
    try{
        await requireClient().rpc("report_violation_v1", { p_kind:kind });
        await segLoadFlags(); otherAfterFlags();
    }catch(_e){ /* 報告できなくても、サーバー側の制限は効いている */ }
    otherSt.reporting = false;
}

/** 通信を見張る：①書きこみのあとはフラグを確かめ直す ②権限エラー・管理者用の操作・隔離中の相手への操作は報告する */
function otherHookFetch(){
    if(otherSt.hooked) return; otherSt.hooked = true;
    const of = window.fetch; if(typeof of !== "function") return;
    window.fetch = function(input, init){
        const p = of.apply(this, arguments);
        try{
            if(!otherActive()) return p;
            const url = String(typeof input === "string" ? input : (input && input.url) || "");
            const at = url.indexOf("/rest/v1/"); if(at < 0) return p;
            const path = url.slice(at + 9).split("?")[0];
            if(/^rpc\/(my_ui_flags|report_violation_v1)$/.test(path)) return p;
            const method = String((init && init.method) || (typeof input === "object" && input && input.method) || "GET").toUpperCase();
            p.then((res) => {
                try{
                    if(!res) return;
                    if(method !== "GET" && method !== "HEAD") otherSoon();
                    if(res.ok || res.status === 401 || res.status >= 500) return;
                    res.clone().json().then((j) => {
                        const code = String(j && j.code || ""), msg = String(j && j.message || "");
                        const isRpc = path.indexOf("rpc/") === 0;
                        if(isRpc && /admin_required|forbidden|not_allowed/.test(msg) && /^rpc\/admin_/.test(path)) otherReport(otherKind("admin_rpc", path));
                        else if(code === "42501" && method !== "GET" && method !== "HEAD") otherReport(otherKind("rls", path));
                        else if(/segment_blocked/.test(msg)) otherReport(otherKind("blocked", path));
                    }).catch(() => {});
                }catch(_e){}
            }, () => {});
        }catch(_e){}
        return p;
    };
}

function initOther(){
    otherHookFetch();
    // 起動直後：前回の答え（キャッシュ）でも ウイルスフラグが立っていれば、すぐに出す
    try{ if(otherActive()) otherAfterFlags(); }catch(_e){}
}

// ---------- 管理者：ウイルス画面になっている人の一覧と解除 ----------
async function otherDecorateAdmin(client){
    let rows = [];
    try{
        const r = await client.rpc("admin_list_virus_v1");
        if(r.error) throw r.error;
        rows = r.data || [];
    }catch(_e){ return; }          // SQL 未実行なら 何も足さない
    if(document.getElementById("otherVirusBox")) return;
    const box = otherMk("div", "admin-card"); box.id = "otherVirusBox";
    box.appendChild(otherMk("b", "", "☣ ウイルス画面になっている人（区分「その他」）"));
    if(!rows.length){ box.appendChild(otherMk("div", "meta", "いまはいません。")); }
    rows.forEach((x) => {
        const card = otherMk("div", "admin-card"); card.style.marginTop = "8px";
        card.appendChild(otherMk("div", "", String(x.display_name || "ユーザー")));
        card.appendChild(otherMk("div", "meta", (x.virus ? "ウイルス画面中" : "解除済み") + " ・ " + (x.strikes || 0) + "回 ・ 理由：" + String(x.reason || "-") + " ・ " + (typeof formatDate === "function" ? formatDate(x.last_at) : String(x.last_at || ""))));
        const row = otherMk("div", "row");
        const b = otherMk("button", "button-secondary", "解除する（送れる回数もリセット）"); b.type = "button";
        b.addEventListener("click", async () => {
            b.disabled = true;
            try{
                const r = await client.rpc("admin_clear_virus_v1", { p_user:x.user_id, p_reset_counts:true });
                if(r.error) throw r.error;
                showToast("解除しました。");
                if(typeof renderAdmin === "function") renderAdmin();
            }catch(error){ showToast(typeof featError === "function" ? featError(error) : String(error && error.message || error)); b.disabled = false; }
        });
        row.appendChild(b); card.appendChild(row); box.appendChild(card);
    });
    el.adminBody.prepend(box);
}

// Supabase のクライアントは、作られた時点の fetch を使い続ける。だから見張りは「ファイルを読みこんだ時点」で入れておく
// （中で「その他」の人かどうかを毎回確かめるので、ほかの区分の人には何も起きない）
try{ otherHookFetch(); }catch(_e){}
