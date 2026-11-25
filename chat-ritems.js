"use strict";
// ===== みんなで使う小さな表：寄せ書きカード／やること・当番表／持ち物チェック・旅のしおり =====
// ・このチャットのメンバーだけが読めます（サーバーの表 room_items。書きこみは関数 item_add / item_update / item_set_done / item_remove だけ）。
// ・画面は 10 秒ごとに最新を取り直します（内容が同じなら、画面は書きかえません）。
// ・名前の表示は、あなた＝「あなた」、ほかの人＝そのチャットで見えている名前です。

const ri = {room:null, kinds:[], rows:[], sig:"", timer:null, body:"", paint:null, tab:"", card:null, busy:false};
const RI_BG = ["#fff4c2", "#ffd9e0", "#d6efff", "#dcf7d4", "#e7dcff", "#ffe3c4"];
const RI_BG_NAMES = ["きいろ", "ももいろ", "みずいろ", "みどり", "むらさき", "オレンジ"];
const RI_EMOJI = ["🎉", "🎂", "💐", "🌸", "⭐", "🎓", "🍀", "💌"];
const RI_PACK_SETS = {
    day:["財布", "スマホ", "充電器", "ハンカチ", "ティッシュ", "飲み物", "鍵", "モバイルバッテリー"],
    stay:["着がえ", "下着", "歯ブラシ", "洗顔・化粧水", "タオル", "充電器", "モバイルバッテリー", "常備薬", "財布", "スマホ", "傘", "ビニール袋"],
    camp:["テント", "寝袋", "マット", "ランタン", "ライター", "調理道具", "食器", "クーラーボックス", "レジャーシート", "軍手", "ごみ袋", "救急セット"],
    school:["筆記用具", "ノート", "教科書", "ハンカチ", "水筒", "上ばき", "体操服", "連絡帳"]
};
const RI_PACK_LABELS = {day:"日帰り", stay:"1泊旅行", camp:"キャンプ", school:"学校"};

function initRItems(){
    registerTool("yo", onYoAction);
    registerTool("td", onTodoAction);
    registerTool("tr", onTripAction);
    extraBubbles.yosegaki_open = (item) => '<div class="bubble yo-open">' + escapeHtml(item.emoji || "🎉") + ' <b>' + escapeHtml(item.title || "寄せ書き") + '</b><br><span class="meta">みんなで書く寄せ書きカードです。ひとこと書いてください</span><br>' +
        '<button type="button" class="button-secondary" data-openyose="' + escapeHtml(item.cardId || "") + '">書く・見る</button></div>';
    extraBubbles.yosegaki = (item) => {
        const notes = Array.isArray(item.notes) ? item.notes.slice(0, 80) : [];
        const bg = Math.max(0, Math.min(RI_BG.length - 1, Number(item.bg) || 0));
        return '<div class="bubble yo-done">' + escapeHtml(item.emoji || "🎉") + ' <b>' + escapeHtml(item.title || "寄せ書き") + '</b>' +
            (item.to ? '<br><span class="meta">' + escapeHtml(item.to) + '</span>' : "") +
            '<div class="yo-wall" style="--yo-bg:' + RI_BG[bg] + '">' + (notes.length ? notes.map((n, i) => '<div class="yo-note yo-c' + (i % RI_BG.length) + '"><span>' + escapeHtml(String(n.t || "").slice(0, 200)) + '</span><small>' + escapeHtml(String(n.n || "").slice(0, 30)) + '</small></div>').join("") : '<span class="meta">まだ書かれていません</span>') + '</div>' +
            (item.more ? '<div class="meta">ほか ' + Number(item.more) + ' 件はカードの中で見られます</div>' : "") + '</div>';
    };
    el.messages.addEventListener("click", (e) => { const b = e.target.closest("[data-openyose]"); if(b) runTool(() => openYose(b.dataset.openyose)); });
}

// ---------- 共通 ----------
function riNeedRoom(){
    if(!state.currentRoom){ showToast("先にチャットを開いてください。"); return null; }
    return state.currentRoom;
}
function riName(id, real){
    if(id === state.user.id) return real ? profileDisplayName(state.profile || {id}) : "あなた";
    return profileDisplayName(feat.known.get(id) || (state.currentRoom && state.currentRoom.partner && state.currentRoom.partner.id === id ? state.currentRoom.partner : {id}));
}
function riMemberIds(){
    const room = state.currentRoom;
    const ids = room && Array.isArray(room.memberIds) && room.memberIds.length ? room.memberIds.slice() : [state.user.id].concat(room && room.partner ? [room.partner.id] : []);
    if(!ids.includes(state.user.id)) ids.unshift(state.user.id);
    return Array.from(new Set(ids));
}
function riDate(s){ const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; }
function riDayLabel(s){ const d = riDate(s); return d ? (d.getMonth() + 1) + "/" + d.getDate() + "（" + "日月火水木金土"[d.getDay()] + "）" : String(s || ""); }
function riUtcDay(d){ return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000; }
function riToday(){ return dayKey(new Date()); }
function riErr(e){ showToast(featError(e)); }

async function riRpc(name, args){
    const r = await requireClient().rpc(name, args);
    if(r.error) throw r.error;
    return r.data;
}
async function riFetch(room, kinds){
    const r = await requireClient().from("room_items").select("id,room_id,kind,parent_id,title,body,data,done,done_by,created_by,created_at,updated_at").eq("room_id", room).in("kind", kinds).order("created_at").limit(900);
    if(r.error) throw r.error;
    return r.data || [];
}
/** 画面（シート）を開いて、10秒ごとに最新を取りにいく。paint(rows) が、中身を描く */
async function riOpen(html, bodyId, kinds, paint){
    const room = riNeedRoom(); if(!room) return;
    clearInterval(ri.timer);
    Object.assign(ri, {room:room.id, kinds, rows:[], sig:"", body:bodyId, paint, card:null, form:false});
    openSheet(html);
    ri.timer = setInterval(() => { if(el.profileModal.hidden || !$(ri.body)){ clearInterval(ri.timer); ri.room = null; } else riRefresh(false); }, 10000);
    await riRefresh(true);
}
async function riRefresh(force){
    const room = ri.room; if(!room) return;
    try{
        const rows = await riFetch(room, ri.kinds);
        if(ri.room !== room || !$(ri.body)) return;
        const sig = JSON.stringify(rows);
        if(!force && sig === ri.sig) return;
        const a = document.activeElement;
        if(!force && a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA") && $(ri.body).contains(a) && String(a.value || "").length) return;   // 入力中は、画面を書きかえない
        ri.sig = sig; ri.rows = rows;
        ri.paint(rows);
    }catch(e){ if($(ri.body)) $(ri.body).innerHTML = '<div class="empty-list">' + escapeHtml(featError(e)) + '</div>'; }
}
async function riDo(fn){
    if(ri.busy) return;
    ri.busy = true;
    try{ await fn(); await riRefresh(true); }
    catch(e){ riErr(e); }
    finally{ ri.busy = false; }
}
function riKeep(ids){ const o = {}; ids.forEach((id) => { const n = $(id); if(n) o[id] = n.value; }); return o; }
function riRestore(o){ Object.keys(o).forEach((id) => { const n = $(id); if(n) n.value = o[id]; }); }
async function riPostText(text){
    if(!state.currentRoom) return;
    await sendMessagePayload({type:"text", text:String(text).slice(0, 3900)}, {keepInput:true});
}

// =====================================================================
// 1) 寄せ書きカード
// =====================================================================
function openYoseList(){ riOpen(toolHead("🎴 寄せ書きカード", "みんなでひとことずつ書いて、1枚のカードにします") + '<div id="yoBody"><div class="empty-list">読み込み中...</div></div>' + toolClose(), "yoBody", ["card", "card_note"], yoPaintList); }
function openYose(id){
    riOpen(toolHead("🎴 寄せ書きカード") + '<div id="yoBody"><div class="empty-list">読み込み中...</div></div>' + toolClose(), "yoBody", ["card", "card_note"], yoPaintList).then(() => {
        if(ri.rows.some((r) => r.id === id && r.kind === "card")){ ri.card = id; yoPaintList(ri.rows); }
        else { ri.card = null; showToast("その寄せ書きカードは、見つかりませんでした（消された可能性があります）。"); }
    });
}
function yoCards(rows){ return rows.filter((r) => r.kind === "card").sort((a, b) => (a.created_at < b.created_at ? 1 : -1)); }
function yoNotes(rows, id){ return rows.filter((r) => r.kind === "card_note" && r.parent_id === id); }
function yoPaintList(rows){
    const box = $("yoBody"); if(!box) return;
    if(ri.form) return;                       // 新しいカードを入力しているあいだは、画面を書きかえない
    if(ri.card){ yoPaintCard(rows); return; }
    const cards = yoCards(rows);
    box.innerHTML = '<button type="button" class="button" data-t="yo:new">＋ 新しいカードをつくる</button>' +
        (cards.length ? cards.map((c) => {
            const n = yoNotes(rows, c.id).length, d = c.data || {};
            return '<button type="button" class="admin-card more-item" data-t="yo:open" data-id="' + escapeHtml(c.id) + '"><b>' + escapeHtml(d.emoji || "🎉") + ' ' + escapeHtml(c.title) + '</b>' +
                '<small class="meta">' + (c.done ? "✅ 完成　" : "✏️ 書いています　") + n + '人が書きました' + (c.body ? "　" + escapeHtml(c.body.slice(0, 30)) : "") + '</small></button>';
        }).join("") : '<div class="empty-list">まだカードがありません。<br>お祝い・お礼・おつかれさまなどに、どうぞ。</div>');
}
function yoNewView(){
    ri.card = null; ri.form = true;
    const box = $("yoBody");
    box.innerHTML = '<label for="yoTitle">カードの題名（100文字まで）</label><input id="yoTitle" type="text" maxlength="100" placeholder="例：〇〇さん、ありがとう！">' +
        '<label for="yoTo">ひとこと・あて名（なくてもOK）</label><input id="yoTo" type="text" maxlength="100" placeholder="例：いつも助かってます">' +
        '<label>絵文字</label><div class="row" id="yoEmo" style="justify-content:flex-start">' + RI_EMOJI.map((e, i) => '<button type="button" class="' + (i === 0 ? "" : "button-secondary") + '" data-t="yo:emo" data-e="' + e + '" aria-pressed="' + (i === 0) + '">' + e + '</button>').join("") + '</div>' +
        '<label>カードの色</label><div class="row" id="yoCol" style="justify-content:flex-start">' + RI_BG.map((c, i) => '<button type="button" class="' + (i === 0 ? "" : "button-secondary") + '" data-t="yo:col" data-i="' + i + '" aria-pressed="' + (i === 0) + '" style="background:' + c + ';color:#333;min-width:64px">' + RI_BG_NAMES[i] + '</button>').join("") + '</div>' +
        '<div class="row"><button type="button" class="button-secondary" data-t="yo:back">もどる</button><button type="button" class="button" data-t="yo:make">つくって、チャットに知らせる</button></div>';
    ri.newEmoji = RI_EMOJI[0]; ri.newBg = 0;
}
function yoPaintCard(rows){
    const box = $("yoBody"); if(!box) return;
    const c = rows.find((r) => r.id === ri.card && r.kind === "card");
    if(!c){ ri.card = null; yoPaintList(rows); return; }
    const d = c.data || {}, notes = yoNotes(rows, c.id), mine = notes.find((n) => n.created_by === state.user.id), owner = c.created_by === state.user.id;
    const bg = Math.max(0, Math.min(RI_BG.length - 1, Number(d.bg) || 0));
    const keep = $("yoMine") ? $("yoMine").value : null;
    box.innerHTML = '<button type="button" class="button-secondary" data-t="yo:back">← 一覧へ</button>' +
        '<div class="yo-card" style="--yo-bg:' + RI_BG[bg] + '"><div class="yo-title">' + escapeHtml(d.emoji || "🎉") + ' ' + escapeHtml(c.title) + '</div>' + (c.body ? '<div class="yo-to">' + escapeHtml(c.body) + '</div>' : "") +
        '<div class="yo-wall">' + (notes.length ? notes.map((n, i) => '<div class="yo-note yo-c' + (i % RI_BG.length) + '"><span>' + escapeHtml(n.body) + '</span><small>' + escapeHtml(riName(n.created_by)) + '</small>' +
            (owner || n.created_by === state.user.id ? '<button type="button" class="yo-x" data-t="yo:rmnote" data-id="' + escapeHtml(n.id) + '" aria-label="このひとことを消す">✕</button>' : "") + '</div>').join("") : '<span class="meta">まだ、だれも書いていません</span>') + '</div></div>' +
        (c.done ? '<div class="meta">✅ このカードは完成しています（これ以上は書けません）</div>' :
            '<label for="yoMine">あなたのひとこと（200文字まで・1人1つ。書き直せます）</label><textarea id="yoMine" rows="3" maxlength="200" placeholder="例：いつもありがとう！">' + escapeHtml(keep !== null ? keep : (mine ? mine.body : "")) + '</textarea>' +
            '<div class="row"><button type="button" class="button" data-t="yo:write" data-id="' + escapeHtml(c.id) + '">' + (mine ? "書き直す" : "書く") + '</button></div>') +
        '<div class="row" style="flex-wrap:wrap">' +
        (owner ? '<button type="button" class="button-secondary" data-t="yo:done" data-id="' + escapeHtml(c.id) + '" data-on="' + (c.done ? 0 : 1) + '">' + (c.done ? "もういちど書けるようにする" : "✅ 完成にする") + '</button>' : "") +
        '<button type="button" class="button-secondary" data-t="yo:send" data-id="' + escapeHtml(c.id) + '">チャットに送る</button>' +
        '<button type="button" class="button-secondary" data-t="yo:png" data-id="' + escapeHtml(c.id) + '">🖼 画像で保存</button>' +
        (owner || !state.currentRoom.is_group ? '<button type="button" class="button-danger" data-t="yo:del" data-id="' + escapeHtml(c.id) + '">カードを消す</button>' : "") + '</div>';
}
function yoSnapshot(c, notes){
    const d = c.data || {};
    const snap = {type:"yosegaki", title:c.title, to:c.body || "", emoji:d.emoji || "🎉", bg:Number(d.bg) || 0, notes:[], more:0};
    const list = notes.slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    for(const n of list){
        const next = {n:riName(n.created_by, true).slice(0, 30), t:n.body};
        snap.notes.push(next);
        if(JSON.stringify(snap).length > 10500){ snap.notes.pop(); break; }
    }
    snap.more = list.length - snap.notes.length;
    return snap;
}
function yoWrap(ctx, text, maxW){
    const lines = []; let cur = "";
    for(const ch of Array.from(String(text))){
        if(ch === "\n" || ctx.measureText(cur + ch).width > maxW){ lines.push(cur); cur = ch === "\n" ? "" : ch; } else cur += ch;
    }
    if(cur) lines.push(cur);
    return lines;
}
function yoPng(c, notes){
    const d = c.data || {}, W = 900, pad = 36, colW = (W - pad * 2 - 20) / 2;
    const cv = document.createElement("canvas"), ctx = cv.getContext("2d");
    ctx.font = "22px sans-serif";
    const cells = notes.slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).map((n, i) => {
        const lines = yoWrap(ctx, n.body, colW - 32); return {n, lines, h:Math.max(90, lines.length * 30 + 58), c:RI_BG[(i + 1) % RI_BG.length]};
    });
    const left = [], right = []; let hl = 0, hr = 0;
    cells.forEach((cell) => { if(hl <= hr){ left.push(cell); hl += cell.h + 14; } else { right.push(cell); hr += cell.h + 14; } });
    const H = 160 + Math.max(hl, hr) + 50;
    cv.width = W; cv.height = Math.max(H, 300);
    ctx.fillStyle = RI_BG[Math.max(0, Math.min(5, Number(d.bg) || 0))]; ctx.fillRect(0, 0, W, cv.height);
    ctx.fillStyle = "#333"; ctx.textBaseline = "top"; ctx.font = "bold 34px sans-serif";
    ctx.fillText((d.emoji || "🎉") + " " + String(c.title).slice(0, 30), pad, 30);
    if(c.body){ ctx.font = "22px sans-serif"; ctx.fillStyle = "#555"; ctx.fillText(String(c.body).slice(0, 44), pad, 84); }
    const draw = (col, x) => { let y = 130; col.forEach((cell) => {
        ctx.fillStyle = cell.c; ctx.fillRect(x, y, colW, cell.h); ctx.strokeStyle = "rgba(0,0,0,.15)"; ctx.strokeRect(x, y, colW, cell.h);
        ctx.fillStyle = "#222"; ctx.font = "22px sans-serif"; cell.lines.forEach((ln, i) => ctx.fillText(ln, x + 16, y + 14 + i * 30));
        ctx.fillStyle = "#666"; ctx.font = "16px sans-serif"; ctx.fillText("— " + riName(cell.n.created_by, true).slice(0, 20), x + 16, y + cell.h - 28);
        y += cell.h + 14; }); };
    draw(left, pad); draw(right, pad + colW + 20);
    return new Promise((res) => cv.toBlob(res, "image/png"));
}
async function onYoAction(action, node){
    if(action === "new"){ yoNewView(); return; }
    if(action === "back"){ ri.card = null; ri.form = false; yoPaintList(ri.rows); riRefresh(false); return; }
    if(action === "open"){ ri.card = node.dataset.id; ri.form = false; yoPaintList(ri.rows); riRefresh(false); return; }
    if(action === "emo"){ ri.newEmoji = node.dataset.e; $("yoEmo").querySelectorAll("button").forEach((b) => { const on = b === node; b.className = on ? "" : "button-secondary"; b.setAttribute("aria-pressed", on); }); return; }
    if(action === "col"){ ri.newBg = Number(node.dataset.i) || 0; $("yoCol").querySelectorAll("button").forEach((b) => { const on = b === node; b.className = on ? "" : "button-secondary"; b.setAttribute("aria-pressed", on); }); return; }
    if(action === "make"){
        const title = ($("yoTitle").value || "").trim(), to = ($("yoTo").value || "").trim();
        if(!title){ showToast("カードの題名を入れてください。"); return; }
        await riDo(async () => {
            const id = await riRpc("item_add", {p_room:ri.room, p_kind:"card", p_title:title, p_body:to, p_data:{emoji:ri.newEmoji || "🎉", bg:ri.newBg || 0}});
            ri.card = id; ri.form = false;
            await sendMessagePayload({type:"yosegaki_open", cardId:id, title, emoji:ri.newEmoji || "🎉"}, {keepInput:true});
            showToast("カードをつくって、チャットに知らせました。");
        });
        return;
    }
    if(action === "write"){
        const t = ($("yoMine").value || "").trim();
        if(!t){ showToast("ひとことを入れてください。"); return; }
        await riDo(async () => { await riRpc("item_add", {p_room:ri.room, p_kind:"card_note", p_title:"", p_body:t, p_data:{}, p_parent:node.dataset.id}); showToast("書きました。"); $("yoMine").value = ""; });
        return;
    }
    if(action === "rmnote"){ await riDo(() => riRpc("item_remove", {p_id:node.dataset.id})); return; }
    if(action === "done"){ await riDo(() => riRpc("item_set_done", {p_id:node.dataset.id, p_done:node.dataset.on === "1"})); return; }
    if(action === "del"){
        if(!confirm("このカードと、書かれたひとことを、すべて消します。よろしいですか？")) return;
        await riDo(() => riRpc("item_remove", {p_id:node.dataset.id})); ri.card = null; yoPaintList(ri.rows); return;
    }
    const c = ri.rows.find((r) => r.id === node.dataset.id && r.kind === "card");
    if(!c) return;
    const notes = yoNotes(ri.rows, c.id);
    if(action === "send"){
        if(!notes.length){ showToast("まだ、ひとことがありません。"); return; }
        await sendMessagePayload(yoSnapshot(c, notes), {keepInput:true}); showToast("チャットに送りました。"); return;
    }
    if(action === "png"){
        const blob = await yoPng(c, notes);
        if(!blob){ showToast("画像を作れませんでした。"); return; }
        downloadBlob(blob, "ARE-寄せ書き.png"); showToast("画像を保存しました。");
    }
}

// =====================================================================
// 3) やること・当番表
// =====================================================================
function openTodo(){
    ri.tab = "task";
    riOpen(toolHead("✅ やること・当番表", "このチャットのみんなで共有します。だれかが変えると、すぐ反映されます") + '<div id="tdBody"><div class="empty-list">読み込み中...</div></div>' + toolClose(), "tdBody", ["task", "duty"], tdPaint);
}
function tdMemberSelect(id, withAll){
    return '<select id="' + id + '">' + (withAll ? '<option value="">だれでも</option>' : "") + riMemberIds().map((m) => '<option value="' + escapeHtml(m) + '">' + escapeHtml(riName(m)) + '</option>').join("") + '</select>';
}
function tdDutyWho(d, offset){
    const ms = Array.isArray(d.m) ? d.m.filter(Boolean) : [], p = Number(d.p) === 7 ? 7 : 1, s = riDate(d.s);
    if(!ms.length || !s) return null;
    const days = riUtcDay(new Date()) - riUtcDay(s) + (offset || 0) * p;
    const idx = ((Math.floor(days / p) % ms.length) + ms.length) % ms.length;
    return ms[idx];
}
function tdPaint(rows){
    const box = $("tdBody"); if(!box) return;
    const keep = riKeep(["tdTitle", "tdWho", "tdDue", "dtTitle", "dtStart", "dtPer"]);
    const tab = ri.tab === "duty" ? "duty" : "task";
    const tabs = '<div class="row" style="justify-content:flex-start"><button type="button" class="' + (tab === "task" ? "" : "button-secondary") + '" data-t="td:tab" data-v="task" aria-pressed="' + (tab === "task") + '">やること</button>' +
        '<button type="button" class="' + (tab === "duty" ? "" : "button-secondary") + '" data-t="td:tab" data-v="duty" aria-pressed="' + (tab === "duty") + '">当番表</button></div>';
    if(tab === "task"){
        const tasks = rows.filter((r) => r.kind === "task"), today = riToday();
        const open = tasks.filter((t) => !t.done).sort((a, b) => String((a.data || {}).due || "9999").localeCompare(String((b.data || {}).due || "9999")));
        const done = tasks.filter((t) => t.done).reverse().slice(0, 30);
        const only = ri.mine ? " checked" : "";
        const line = (t) => {
            const d = t.data || {}, late = !t.done && d.due && d.due < today;
            return '<div class="admin-card" style="display:flex;gap:8px;align-items:center"><button type="button" class="' + (t.done ? "" : "button-secondary") + '" style="min-width:36px" data-t="td:toggle" data-id="' + escapeHtml(t.id) + '" data-on="' + (t.done ? 0 : 1) + '" aria-pressed="' + t.done + '" aria-label="' + (t.done ? "未完了にもどす" : "完了にする") + '">' + (t.done ? "✅" : "☐") + '</button>' +
                '<span style="flex:1;min-width:0' + (t.done ? ";text-decoration:line-through;opacity:.6" : "") + '">' + escapeHtml(t.title) +
                '<small class="meta" style="display:block">' + (d.who ? "担当：" + escapeHtml(riName(d.who)) : "担当：だれでも") + (d.due ? "　期限：" + escapeHtml(riDayLabel(d.due)) + (late ? " ⚠️すぎています" : "") : "") + (t.done && t.done_by ? "　完了：" + escapeHtml(riName(t.done_by)) : "") + '</small></span>' +
                '<button type="button" class="button-secondary" data-t="td:rm" data-id="' + escapeHtml(t.id) + '" aria-label="消す">🗑</button></div>';
        };
        const shown = ri.mine ? open.filter((t) => (t.data || {}).who === state.user.id) : open;
        box.innerHTML = tabs +
            '<div class="admin-card"><label for="tdTitle">やること（100文字まで）</label><input id="tdTitle" type="text" maxlength="100" placeholder="例：会場をよやくする">' +
            '<div class="row" style="flex-wrap:wrap"><label>担当 ' + tdMemberSelect("tdWho", true) + '</label><label>期限 <input id="tdDue" type="date" min="' + today + '"></label><button type="button" class="button" data-t="td:add">追加</button></div></div>' +
            '<label class="row" style="gap:8px;justify-content:flex-start"><input type="checkbox" data-t="td:mine"' + only + '> 自分の担当だけ見る</label>' +
            '<div>' + (shown.length ? shown.map(line).join("") : '<div class="empty-list">やることはありません 🎉</div>') + '</div>' +
            (done.length ? '<b>完了（' + done.length + '）</b>' + done.map(line).join("") : "") +
            '<div class="row"><button type="button" class="button-secondary" data-t="td:paste"' + (open.length ? "" : " disabled") + '>チャットに貼る</button><button type="button" class="button-secondary" data-t="td:clear"' + (done.length ? "" : " disabled") + '>完了を消す</button></div>';
    }else{
        const duties = rows.filter((r) => r.kind === "duty");
        const mem = riMemberIds();
        const card = (t) => {
            const d = t.data || {}, who = tdDutyWho(d, 0), per = Number(d.p) === 7 ? "週" : "日";
            const next = [1, 2, 3, 4, 5, 6].map((i) => tdDutyWho(d, i)).filter(Boolean);
            return '<div class="admin-card"><b>🧹 ' + escapeHtml(t.title) + '</b>（1' + per + 'ごと）<div style="margin:6px 0">' + (Number(d.p) === 7 ? "今週" : "今日") + 'の当番：<b style="font-size:1.15em">' + escapeHtml(who ? riName(who) : "（決まっていません）") + '</b></div>' +
                '<div class="meta">このあと：' + escapeHtml(next.map((m) => riName(m)).join(" → ")) + '</div>' +
                '<div class="row" style="flex-wrap:wrap"><button type="button" class="button-secondary" data-t="td:shift" data-id="' + escapeHtml(t.id) + '">順番を1つ進める（交代したとき）</button>' +
                '<button type="button" class="button-secondary" data-t="td:dpaste" data-id="' + escapeHtml(t.id) + '">チャットに知らせる</button>' +
                '<button type="button" class="button-secondary" data-t="td:rm" data-id="' + escapeHtml(t.id) + '" aria-label="消す">🗑</button></div></div>';
        };
        box.innerHTML = tabs + (duties.length ? duties.map(card).join("") : '<div class="empty-list">当番はまだありません。下でつくってください。</div>') +
            '<div class="admin-card"><b>新しい当番</b><label for="dtTitle">当番の名前（100文字まで）</label><input id="dtTitle" type="text" maxlength="100" placeholder="例：ごみ出し">' +
            '<label>順番（チェックした人が、この順で回ります）</label><div class="pick" id="dtMem">' + mem.map((m) => '<label><input type="checkbox" value="' + escapeHtml(m) + '" checked> ' + escapeHtml(riName(m)) + '</label>').join("") + '</div>' +
            '<div class="row" style="flex-wrap:wrap"><label>交代の間隔 <select id="dtPer"><option value="1">1日ごと</option><option value="7">1週間ごと</option></select></label><label>はじまりの日 <input id="dtStart" type="date" value="' + riToday() + '"></label></div>' +
            '<div class="row"><button type="button" class="button" data-t="td:dadd">当番をつくる</button></div></div>';
    }
    riRestore(keep);
    const t = $("tdTitle"); if(t) t.onkeydown = (e) => { if(e.key === "Enter"){ e.preventDefault(); runTool(() => onTodoAction("add")); } };
}
async function onTodoAction(action, node){
    if(action === "tab"){ ri.tab = node.dataset.v; tdPaint(ri.rows); return; }
    if(action === "mine"){ ri.mine = !!node.checked; tdPaint(ri.rows); return; }
    if(action === "add"){
        const t = ($("tdTitle").value || "").trim(); if(!t) return;
        const data = {}; const w = $("tdWho").value, due = $("tdDue").value;
        if(w) data.who = w; if(due) data.due = due;
        await riDo(async () => { await riRpc("item_add", {p_room:ri.room, p_kind:"task", p_title:t, p_body:"", p_data:data}); $("tdTitle").value = ""; $("tdDue").value = ""; });
        return;
    }
    if(action === "toggle"){ await riDo(() => riRpc("item_set_done", {p_id:node.dataset.id, p_done:node.dataset.on === "1"})); return; }
    if(action === "rm"){ await riDo(() => riRpc("item_remove", {p_id:node.dataset.id})); return; }
    if(action === "clear"){
        const ids = ri.rows.filter((r) => r.kind === "task" && r.done).map((r) => r.id);
        await riDo(async () => { for(const id of ids) await riRpc("item_remove", {p_id:id}).catch(() => {}); });   // 自分に消せないものは、そのまま残す
        return;
    }
    if(action === "paste"){
        const open = ri.rows.filter((r) => r.kind === "task" && !r.done);
        const lines = open.map((t) => { const d = t.data || {}; return "・" + t.title + (d.who ? "（" + riName(d.who, true) + "）" : "") + (d.due ? " 〜" + riDayLabel(d.due) : ""); });
        await riPostText("✅ やること\n" + lines.join("\n")); closeSheet(); return;
    }
    if(action === "dadd"){
        const t = ($("dtTitle").value || "").trim(); if(!t){ showToast("当番の名前を入れてください。"); return; }
        const ms = Array.from($("dtMem").querySelectorAll("input:checked")).map((i) => i.value);
        if(!ms.length){ showToast("順番に入る人を、1人以上えらんでください。"); return; }
        const s = $("dtStart").value || riToday();
        await riDo(async () => { await riRpc("item_add", {p_room:ri.room, p_kind:"duty", p_title:t, p_body:"", p_data:{m:ms, p:Number($("dtPer").value) === 7 ? 7 : 1, s}}); $("dtTitle").value = ""; });
        return;
    }
    const row = ri.rows.find((r) => r.id === (node && node.dataset.id));
    if(action === "shift" && row){
        const d = Object.assign({}, row.data || {}), p = Number(d.p) === 7 ? 7 : 1, s = riDate(d.s);
        if(!s) return;
        s.setDate(s.getDate() - p);       // はじまりを1周期ぶん前にずらす ＝ 順番が1つ進む
        d.s = dayKey(s);
        await riDo(() => riRpc("item_update", {p_id:row.id, p_title:null, p_body:null, p_data:d}));
        return;
    }
    if(action === "dpaste" && row){
        const who = tdDutyWho(row.data || {}, 0);
        await riPostText("🧹 " + (Number((row.data || {}).p) === 7 ? "今週" : "今日") + "の「" + row.title + "」当番は、" + (who ? riName(who, true) : "（未定）") + " さんです。"); showToast("チャットに知らせました。");
    }
}

// =====================================================================
// 5) 持ち物チェック・旅のしおり
// =====================================================================
function openTrip(){
    ri.tab = "pack";
    riOpen(toolHead("🧳 持ち物チェック・旅のしおり", "このチャットのみんなで共有します") + '<div id="trBody"><div class="empty-list">読み込み中...</div></div>' + toolClose(), "trBody", ["pack", "trip"], trPaint);
}
function trPaint(rows){
    const box = $("trBody"); if(!box) return;
    const keep = riKeep(["pkNew", "tpDay", "tpTime", "tpTitle", "tpMemo"]);
    const tab = ri.tab === "trip" ? "trip" : "pack";
    const tabs = '<div class="row" style="justify-content:flex-start"><button type="button" class="' + (tab === "pack" ? "" : "button-secondary") + '" data-t="tr:tab" data-v="pack" aria-pressed="' + (tab === "pack") + '">持ち物チェック</button>' +
        '<button type="button" class="' + (tab === "trip" ? "" : "button-secondary") + '" data-t="tr:tab" data-v="trip" aria-pressed="' + (tab === "trip") + '">旅のしおり</button></div>';
    if(tab === "pack"){
        const items = rows.filter((r) => r.kind === "pack"), done = items.filter((x) => x.done).length;
        const line = (x) => '<div class="admin-card" style="display:flex;gap:8px;align-items:center"><button type="button" class="' + (x.done ? "" : "button-secondary") + '" style="min-width:36px" data-t="tr:toggle" data-id="' + escapeHtml(x.id) + '" data-on="' + (x.done ? 0 : 1) + '" aria-pressed="' + x.done + '">' + (x.done ? "✅" : "☐") + '</button>' +
            '<span style="flex:1;min-width:0' + (x.done ? ";opacity:.6" : "") + '">' + escapeHtml(x.title) + (x.done && x.done_by ? '<small class="meta"> ' + escapeHtml(riName(x.done_by)) + '</small>' : "") + '</span>' +
            '<button type="button" class="button-secondary" data-t="tr:rm" data-id="' + escapeHtml(x.id) + '" aria-label="消す">🗑</button></div>';
        box.innerHTML = tabs + '<div class="meta">' + done + ' / ' + items.length + ' 個 そろいました</div>' +
            '<div class="row" style="justify-content:flex-start"><input id="pkNew" type="text" maxlength="100" placeholder="例：パスポート　（持ち物を1つ入れる）" style="flex:1"><button type="button" class="button" data-t="tr:add">追加</button></div>' +
            '<div class="meta">まとめて入れる：</div><div class="row" style="flex-wrap:wrap;justify-content:flex-start">' + Object.keys(RI_PACK_SETS).map((k) => '<button type="button" class="button-secondary" data-t="tr:set" data-k="' + k + '">' + RI_PACK_LABELS[k] + 'セット</button>').join("") + '</div>' +
            '<div>' + (items.length ? items.filter((x) => !x.done).map(line).join("") + items.filter((x) => x.done).map(line).join("") : '<div class="empty-list">持ち物はまだありません。</div>') + '</div>' +
            '<div class="row" style="flex-wrap:wrap"><button type="button" class="button-secondary" data-t="tr:ppaste"' + (items.length - done ? "" : " disabled") + '>まだのものをチャットに貼る</button><button type="button" class="button-secondary" data-t="tr:reset"' + (done ? "" : " disabled") + '>チェックを全部外す</button></div>';
    }else{
        const stops = rows.filter((r) => r.kind === "trip").sort((a, b) => (String((a.data || {}).d || "") + String((a.data || {}).t || "")).localeCompare(String((b.data || {}).d || "") + String((b.data || {}).t || "")));
        const days = [];
        stops.forEach((s) => { const k = (s.data || {}).d || ""; let g = days.find((x) => x.k === k); if(!g){ g = {k, list:[]}; days.push(g); } g.list.push(s); });
        box.innerHTML = tabs +
            '<div class="admin-card"><b>予定を足す</b><div class="row" style="flex-wrap:wrap"><label>日 <input id="tpDay" type="date" value="' + riToday() + '"></label><label>時間 <input id="tpTime" type="time"></label></div>' +
            '<label for="tpTitle">なにをする？（100文字まで）</label><input id="tpTitle" type="text" maxlength="100" placeholder="例：集合・出発">' +
            '<label for="tpMemo">メモ（集合場所・持ち物・お金など／500文字まで）</label><textarea id="tpMemo" rows="2" maxlength="500"></textarea>' +
            '<div class="row"><button type="button" class="button" data-t="tr:tadd">足す</button></div></div>' +
            (days.length ? days.map((g) => '<div class="admin-card"><b>' + escapeHtml(g.k ? riDayLabel(g.k) : "日にち未定") + '</b>' + g.list.map((s) => {
                const d = s.data || {};
                return '<div style="display:flex;gap:8px;align-items:flex-start;margin-top:8px"><div style="min-width:3.2em;font-weight:bold">' + escapeHtml(d.t || "—") + '</div><div style="flex:1;min-width:0"><div>' + escapeHtml(s.title) + '</div>' + (s.body ? '<div class="meta" style="white-space:pre-wrap">' + escapeHtml(s.body) + '</div>' : "") + '</div>' +
                    '<button type="button" class="button-secondary" data-t="tr:rm" data-id="' + escapeHtml(s.id) + '" aria-label="消す">🗑</button></div>';
            }).join("") + '</div>').join("") : '<div class="empty-list">しおりはまだありません。</div>') +
            '<div class="row" style="flex-wrap:wrap"><button type="button" class="button-secondary" data-t="tr:tpaste"' + (stops.length ? "" : " disabled") + '>チャットに送る</button><button type="button" class="button-secondary" data-t="tr:tcopy"' + (stops.length ? "" : " disabled") + '>コピー</button></div>';
    }
    riRestore(keep);
    const n = $("pkNew"); if(n) n.onkeydown = (e) => { if(e.key === "Enter"){ e.preventDefault(); runTool(() => onTripAction("add")); } };
}
function trText(){
    const stops = ri.rows.filter((r) => r.kind === "trip").sort((a, b) => (String((a.data || {}).d || "") + String((a.data || {}).t || "")).localeCompare(String((b.data || {}).d || "") + String((b.data || {}).t || "")));
    let out = "🧳 旅のしおり", last = null;
    stops.forEach((s) => { const d = s.data || {}; if(d.d !== last){ out += "\n\n■ " + (d.d ? riDayLabel(d.d) : "日にち未定"); last = d.d; } out += "\n" + (d.t ? d.t + " " : "") + s.title + (s.body ? "\n　" + s.body.replace(/\n/g, "\n　") : ""); });
    return out;
}
async function onTripAction(action, node){
    if(action === "tab"){ ri.tab = node.dataset.v; trPaint(ri.rows); return; }
    if(action === "add"){
        const t = ($("pkNew").value || "").trim(); if(!t) return;
        await riDo(async () => { await riRpc("item_add", {p_room:ri.room, p_kind:"pack", p_title:t, p_body:"", p_data:{}}); $("pkNew").value = ""; });
        return;
    }
    if(action === "set"){
        const have = new Set(ri.rows.filter((r) => r.kind === "pack").map((r) => r.title));
        const list = (RI_PACK_SETS[node.dataset.k] || []).filter((x) => !have.has(x));
        if(!list.length){ showToast("そのセットは、もう全部入っています。"); return; }
        await riDo(async () => { for(const x of list) await riRpc("item_add", {p_room:ri.room, p_kind:"pack", p_title:x, p_body:"", p_data:{}}); });
        return;
    }
    if(action === "toggle"){ await riDo(() => riRpc("item_set_done", {p_id:node.dataset.id, p_done:node.dataset.on === "1"})); return; }
    if(action === "rm"){ await riDo(() => riRpc("item_remove", {p_id:node.dataset.id})); return; }
    if(action === "reset"){
        const ids = ri.rows.filter((r) => r.kind === "pack" && r.done).map((r) => r.id);
        await riDo(async () => { for(const id of ids) await riRpc("item_set_done", {p_id:id, p_done:false}); });
        return;
    }
    if(action === "ppaste"){
        const list = ri.rows.filter((r) => r.kind === "pack" && !r.done).map((r) => "・" + r.title);
        await riPostText("🧳 まだ、そろっていない持ち物\n" + list.join("\n")); closeSheet(); return;
    }
    if(action === "tadd"){
        const t = ($("tpTitle").value || "").trim(); if(!t){ showToast("なにをするか、入れてください。"); return; }
        const data = {d:$("tpDay").value || "", t:$("tpTime").value || ""};
        await riDo(async () => { await riRpc("item_add", {p_room:ri.room, p_kind:"trip", p_title:t, p_body:($("tpMemo").value || "").trim(), p_data:data}); $("tpTitle").value = ""; $("tpMemo").value = ""; });
        return;
    }
    if(action === "tpaste"){ await riPostText(trText()); showToast("チャットに送りました。"); return; }
    if(action === "tcopy"){
        try{ await navigator.clipboard.writeText(trText()); showToast("コピーしました。"); }catch(_e){ showToast("コピーできませんでした。"); }
    }
}
