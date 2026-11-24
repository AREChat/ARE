"use strict";
// ===== 区分「その他」専用の厳重対策（画面側） =====
// ・サーバー側（sql/other_privacy_v1.sql）が「その他」の人の不正を見つけると my_ui_flags().virus が true になる
//   → すぐに「ウイルス画面」（virus.html?other=1）へ飛ぶ（送信もサーバー側で止まっている）。管理者が解除するまで、その画面のまま。
// ・画面から見つけた禁止操作（権限エラー・管理者用の操作・隔離されている相手への操作）も、自分の分だけサーバーに報告する。
//   誤検知が出た場合の非常口：  update private.other_guard_cfg set client_reports = false;
// ・管理者に送れる残り回数の案内、回数制限・保護モードのエラー文（4言語）
// ・ほかの区分（家庭・社員・友人）の人には、何も出ません（flags.other が null）。

const OTHER_TXT = {
    ja: { left: "管理者に送れるメッセージは、あと{n}通です", leftZero: "管理者に送れるメッセージは、上限に達しました",
        eAdmin: "管理者に送れるメッセージは5通までです。上限に達しました。", eUser: "ほかの相手には、1通までしか送れません。", eVirus: "保護モード中のため、送信できません。管理者にお問い合わせください。" },
    en: { left: "You can send {n} more message(s) to the administrator", leftZero: "You have reached the limit of messages to the administrator",
        eAdmin: "You can send up to 5 messages to the administrator. The limit has been reached.", eUser: "You can only send 1 message to other people.", eVirus: "You cannot send messages while in protected mode. Please contact the administrator." },
    zh: { left: "您还可以向管理员发送 {n} 条消息", leftZero: "向管理员发送消息的次数已达上限",
        eAdmin: "最多只能向管理员发送 5 条消息，已达上限。", eUser: "对其他人最多只能发送 1 条消息。", eVirus: "保护模式中无法发送消息。请联系管理员。" },
    ko: { left: "관리자에게 보낼 수 있는 메시지가 {n}개 남았습니다", leftZero: "관리자에게 보낼 수 있는 메시지 한도에 도달했습니다",
        eAdmin: "관리자에게는 최대 5개까지 보낼 수 있습니다. 한도에 도달했습니다.", eUser: "다른 사람에게는 1개까지만 보낼 수 있습니다.", eVirus: "보호 모드 중에는 메시지를 보낼 수 없습니다. 관리자에게 문의해 주세요." },
};
const otherSt = { hooked:false, soonT:0, reporting:false, shown:false };

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
    s.textContent = "#otherLimitNote{margin:8px 0;padding:8px 12px;border-radius:12px;font-size:13px;font-weight:700;text-align:center;background:rgba(120,120,120,.14)}";
    document.head.appendChild(s);
}

function otherMk(tag, cls, text){
    const n = document.createElement(tag); if(cls) n.className = cls; if(text != null) n.textContent = text; return n;
}

/** ウイルス画面（virus.html）へ飛ぶ。画面そのものは virus.html / virus.js / virus.css（NGワードのおしおき画面と共通） */
function otherGoVirus(){
    if(otherSt.shown) return;
    otherSt.shown = true;
    try{ location.replace("./virus.html?other=1"); }catch(_e){ location.href = "./virus.html?other=1"; }
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
    if(f && f.virus === true && f.other){ otherGoVirus(); return; }
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
    // 言語を切りかえたら、残り回数の案内も その言語で 書きなおす
    try{ if(window.AREI18N) AREI18N.onChange(() => { try{ otherPaintLimit(); }catch(_e){} }); }catch(_e){}
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
