"use strict";
// ===== 手札をかくすカードゲーム（ババ抜き / トモヒロウ(大富豪) / インディアンポーカー / ウソダロウ(ダウト)）=====
// 手札と山札はサーバー(Supabase)の中だけにあり、画面には「自分が見てよい情報」だけが届きます。
// チャットには「始めました」のメッセージだけが出ます（中身はこの画面で確認）。2〜3秒ごとに最新の状態を取りにいきます。

const CG_GAMES = {
    baba:{name:"ババ抜き", icon:"🃏", desc:"2人。同じ数字はペアで捨てる。ジョーカーを持ったままだと負け"},
    tomo:{name:"トモヒロウ", icon:"👑", desc:"2人。強いカードを出して先に手札を空にする。3<…<K<A<2"},
    indian:{name:"インディアンポーカー", icon:"🎴", desc:"相手のカードだけ見える。5回戦、コイン10枚から"},
    uso:{name:"ウソダロウ（ダウト）", icon:"🤥", desc:"伏せて出して「A,2,3…」と言い張る。うそだと思ったらダウト！"}
};
const CG_SUIT = {S:"♠", H:"♥", D:"♦", C:"♣"};
const CG_RANK_LABEL = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
feat.cg = {ended:{}, gid:null, view:null, sel:[], timer:null, busy:false, autoTimer:null, done:{}, active:{}, skip:{}, watchTimer:null, jumpBtn:null};

// ===== 対戦専用チャット（個人チャットとは別の部屋で、ゲームの会話をする）=====
// ・部屋の名前（絵文字＋ゲーム名＋「対戦」）で、対戦専用チャットかどうかを見分ける（新しい列は増やさない）。
// ・ゲームを始めるときは、この名前の部屋がすでにあれば使い、なければ create_group で新しく作る（相手と自分の2人だけ）。
// ・個人チャット側には、対戦チャットへ飛べる小さなボタンを出す。対戦チャット側には、個人チャットへ飛べるボタンを出す。
function cgRoomName(game){ const info = CG_GAMES[game]; return info ? info.icon + " " + info.name + "対戦" : ""; }
function cgRoomGameKey(room){
    if(!room || !room.is_group || !room.name) return null;
    return Object.keys(CG_GAMES).find((k) => cgRoomName(k) === room.name) || null;
}
function cgFindGameRoom(partnerId, game){
    const name = cgRoomName(game);
    return (state.rooms || []).find((r) => r.is_group && r.name === name && (r.memberIds || []).length === 2 && (r.memberIds || []).includes(partnerId)) || null;
}
function cgFindAnyGameRoom(partnerId){
    return (state.rooms || []).find((r) => r.is_group && cgRoomGameKey(r) && (r.memberIds || []).length === 2 && (r.memberIds || []).includes(partnerId)) || null;
}
// いま開いている部屋から「対戦相手のID」を取る（個人チャットでも、対戦専用チャットでもOK。ふつうのグループは対象外）
function cgCurrentPartnerId(){
    const room = state.currentRoom;
    if(!room) return null;
    if(!room.is_group) return room.partnerId || (room.partner && room.partner.id) || null;
    if(!cgRoomGameKey(room)) return null;
    return (room.memberIds || []).find((id) => id !== state.user.id) || null;
}
async function cgEnsureGameRoom(game, partnerId){
    const existing = cgFindGameRoom(partnerId, game);
    if(existing) return existing;
    try{
        const result = await requireClient().rpc("create_group",{p_name:cgRoomName(game), p_member_ids:[partnerId], p_notice:null});
        if(result.error) throw result.error;
        await loadRooms();
        const room = (state.rooms || []).find((r) => r.id === result.data);
        if(!room){ showToast("対戦チャットを作成しましたが、読み込みに失敗しました。もう一度お試しください。"); return null; }
        return room;
    }catch(error){
        showToast("対戦チャットを作れませんでした：" + getErrorMessage(error));
        return null;
    }
}
// チャット上部に、個人チャット⇔対戦チャットを行き来する小さなボタンを出す
function cgPaintHeaderLink(room){
    const btn = feat.cg.jumpBtn; if(!btn) return;
    if(!room){ btn.hidden = true; return; }
    const ownGameKey = cgRoomGameKey(room);
    if(ownGameKey){
        const partnerId = (room.memberIds || []).find((id) => id !== state.user.id);
        if(!partnerId){ btn.hidden = true; return; }
        btn.hidden = false; btn.textContent = "💬"; btn.title = "個人チャットへ"; btn.setAttribute("aria-label","個人チャットへ戻る");
        btn.onclick = () => openOrCreateDirectChat(partnerId);
        return;
    }
    if(room.is_group || !room.partnerId){ btn.hidden = true; return; }
    const gameRoom = cgFindAnyGameRoom(room.partnerId);
    if(!gameRoom){ btn.hidden = true; return; }
    const info = CG_GAMES[cgRoomGameKey(gameRoom)] || {icon:"🎮"};
    btn.hidden = false; btn.textContent = info.icon; btn.title = "対戦チャットへ（" + gameRoom.name + "）"; btn.setAttribute("aria-label","対戦チャットへ");
    btn.onclick = () => selectRoom(gameRoom,null);
}
// 部屋一覧にも、同じ行き来ボタンを小さく出す（開かなくても ひと目で分かるように）
function cgPaintRoomList(){
    if(!el.roomList) return;
    el.roomList.querySelectorAll("[data-room-id]").forEach((rowBtn) => {
        const old = rowBtn.querySelector(".cg-jump"); if(old) old.remove();
        const room = (state.rooms || []).find((r) => r.id === rowBtn.dataset.roomId);
        if(!room) return;
        let onClick = null, icon = "", title = "";
        if(!room.is_group && room.partnerId){
            const gameRoom = cgFindAnyGameRoom(room.partnerId);
            if(gameRoom){ icon = (CG_GAMES[cgRoomGameKey(gameRoom)] || {}).icon || "🎮"; title = "対戦チャットへ"; onClick = () => selectRoom(gameRoom,null); }
        }else{
            const gameKey = cgRoomGameKey(room);
            if(gameKey){
                const partnerId = (room.memberIds || []).find((id) => id !== state.user.id);
                if(partnerId){ icon = "💬"; title = "個人チャットへ"; onClick = () => openOrCreateDirectChat(partnerId); }
            }
        }
        if(!onClick) return;
        const b = document.createElement("button");
        b.type = "button"; b.className = "cg-jump"; b.textContent = icon; b.title = title; b.setAttribute("aria-label",title);
        b.addEventListener("click",(event) => { event.preventDefault(); event.stopPropagation(); onClick(); });
        rowBtn.appendChild(b);
    });
}

function initCards(){
    registerTool("cg", onCgAction);
    el.messages.addEventListener("click", (event) => {
        const node = event.target.closest("[data-cgopen]");
        if(!node) return;
        runTool(() => openCg(node.dataset.cgopen));
    });
    feat.cg.watchTimer = setInterval(() => { cgWatchTick().catch(() => {}); }, 6000);   // 画面をとじていても、勝負がついたら 知らせる

    // ヘッダーの 行き来ボタン
    const head = document.querySelector(".chat-header"), anchor = document.getElementById("refreshMessagesButton");
    if(head && anchor){
        const b = document.createElement("button");
        b.type = "button"; b.id = "cgJumpBtn"; b.className = "button-secondary"; b.hidden = true;
        head.insertBefore(b,anchor);
        feat.cg.jumpBtn = b;
    }
    addRoomHook((room) => { try{ cgPaintHeaderLink(room); }catch(_e){} });

    // 部屋一覧にも、同じボタンを描く（一覧が描きなおされるたびに付けなおす）
    const origRenderRooms = renderRooms;
    renderRooms = function(){
        origRenderRooms.apply(this,arguments);
        try{ cgPaintRoomList(); }catch(_e){ /* 続行 */ }
    };
}

/** 勝負がついたときの 結果の文（例：「ゲーム終了！ ゆめさんの勝利です！」） */
function cgResultText(v){
    const w = v && v.winner;
    if(!w) return "ゲーム終了！ 引き分けです。";
    return "ゲーム終了！ " + (w === state.user.id ? "あなたの勝利です！" : vsName(w) + "さんの勝利です！");
}
/** 会話の中の「参加・続きを見る」のふきだしに、結果の1行を足す（もう足してあれば、文だけ入れかえる） */
function cgPaintBubbleResult(gid){
    const d = feat.cg.done[gid];
    if(!d || !el.messages) return;
    el.messages.querySelectorAll('[data-cgopen="' + gid + '"]').forEach((btn) => {
        const bubble = btn.closest(".bubble"); if(!bubble) return;
        let line = bubble.querySelector(".vs-result");
        if(!line){ line = document.createElement("div"); line.className = "vs-result"; bubble.appendChild(line); }
        line.textContent = "🏁 " + cgResultText(d);
    });
}
/** サーバーから届いた最新の状態を見て、「いま終わった」と気づいたら、一度だけ 知らせる（はじめから終わっていたものは、静かに記録だけ） */
function cgAnnounce(gid, v){
    const cg = feat.cg;
    if(!gid || !v) return;
    if(v.status === "done"){
        const first = !cg.done[gid];
        cg.done[gid] = {winner:v.winner || null};
        if(first && cg.active[gid]) showToast(cgResultText(v));
        cgPaintBubbleResult(gid);
    }else cg.active[gid] = true;
}
/** 部屋にある いちばん新しいカードゲームが、まだ終わっていなければ、ときどき様子を見にいく（開いている画面があるときは、その画面が見るので しない） */
async function cgWatchTick(){
    const cg = feat.cg;
    if(document.hidden || !state.currentRoom || !state.user || $("cgBody") || cg.busy) return;
    let gid = "";
    const now = Date.now();
    for(let i = state.messages.length - 1; i >= 0 && i >= state.messages.length - 60; i--){
        const m = state.messages[i];
        if(!m.content || m.content.indexOf('"cg"') < 0) continue;
        const item = parseMessageContent(m.content);
        if(!item || item.type !== "game" || item.game !== "cg" || item.kind !== "start") continue;
        const g = String(item.gid || "").replace(/[^0-9a-f-]/gi, "");
        if(!g || cg.done[g] || cg.ended[g] || cg.skip[g]) continue;
        if(now - new Date(m.created_at).getTime() > 3 * 3600 * 1000) continue;   // 3時間より前のものは、見にいかない
        gid = g; break;
    }
    if(!gid) return;
    try{
        const r = await requireClient().rpc("cg_view", {p_game:gid});
        if(r.error || !r.data){ cg.skip[gid] = true; return; }   // 見られないもの（参加者でない など）は、もう見にいかない
        const v = r.data;
        if(v.status === "done" || (v.players || []).includes(state.user.id)) cgAnnounce(gid, v); else cg.skip[gid] = true;
    }catch(_e){ /* つぎの機会に */ }
}

function cgLabel(c){ return c === "JK" ? "🃏" : (CG_SUIT[c[0]] || "") + CG_RANK_LABEL[Number(c.slice(1))]; }
function cgCard(c, attrs, cls){
    const red = c !== "JK" && (c[0] === "H" || c[0] === "D");
    return '<button type="button" class="bj-card cg-card' + (red ? " red" : "") + (cls ? " " + cls : "") + '" ' + (attrs || "") + '>' + cgLabel(c) + '</button>';
}
function cgBack(attrs){ return '<button type="button" class="bj-card back cg-card" ' + (attrs || "") + '>🂠</button>'; }
function cgSortHand(h){ return (h || []).slice().sort((a, b) => (a === "JK") - (b === "JK") || Number(a.slice(1)) - Number(b.slice(1)) || a.localeCompare(b)); }

function openCardGames(){
    if(!state.currentRoom){ showToast("先にチャットを開いてください。"); return; }
    openSheet(toolHead("🂡 カードゲーム（手札かくし）", "手札はサーバーで管理され、相手には見えません。始めると、チャットに参加ボタンが出ます。") +
        Object.keys(CG_GAMES).map((k) => '<button type="button" class="admin-card more-item" data-t="cg:start" data-g="' + k + '">' + CG_GAMES[k].icon + ' ' + escapeHtml(CG_GAMES[k].name) + '<small class="meta">' + escapeHtml(CG_GAMES[k].desc) + '</small></button>').join("") + toolClose());
}

function renderCgBubble(item){
    const info = CG_GAMES[item.cg];
    if(!info) return '<div class="bubble">🂡 カードゲーム</div>';
    const gid0 = String(item.gid || "").replace(/[^0-9a-f-]/gi, ""), dn = feat.cg.done[gid0];
    return '<div class="bubble">' + info.icon + ' <b>' + escapeHtml(info.name) + '</b><br><span class="meta">手札かくしの2人対戦</span><br>' +
        '<button type="button" class="button-secondary" data-cgopen="' + escapeHtml(gid0) + '">参加・続きを見る</button>' +
        (dn ? '<div class="vs-result">🏁 ' + escapeHtml(cgResultText(dn)) + '</div>' : '') + '</div>';
}

async function onCgAction(action, node){
    const cg = feat.cg;
    if(action === "start"){
        const game = node.dataset.g;
        if(!CG_GAMES[game] || !state.currentRoom){ showToast("先にチャットを開いてください。"); return; }
        const partnerId = cgCurrentPartnerId();
        if(!partnerId){ showToast("1対1のチャット（または対戦チャット）から始めてください。"); return; }
        await cgFreshenForGuard();
        if(gameBusyBlocked()) return;
        closeSheet();
        // 個人チャットとは別の「対戦専用チャット」に切りかえてから、ゲームを始める（なければ新しく作る）
        const gameRoom = await cgEnsureGameRoom(game,partnerId);
        if(!gameRoom) return;
        const result = await requireClient().rpc("cg_create", {p_room_id:gameRoom.id, p_game:game});
        if(result.error) throw result.error;
        const gid = result.data;
        // sendMessagePayload は「いま開いている部屋」に送る仕組みなので、部屋の切りかえと競合しないよう、
        // 先に対戦専用チャットへ直接メッセージを送ってから、画面をその部屋に切りかえる
        const sendResult = await sendPayloadToRoom(gameRoom.id,{type:"game", game:"cg", cg:game, gid, kind:"start"});
        if(sendResult.error) throw sendResult.error;
        await selectRoom(gameRoom,null);
        await openCg(gid);
        return;
    }
    if(action === "end"){
        if(!confirm("このゲームを終了しますか？（手札かくしのゲームは、相手の画面ではそのまま続きます）")) return;
        if(cg.gid) cg.ended[cg.gid] = true;
        stopCgTimer(); closeSheet();
        showToast("ゲームを終了しました。ほかのゲームを始められます。");
        return;
    }
    if(action === "join"){ await cgCall("cg_join", {p_game:cg.gid}); return; }
    if(action === "sel"){
        const c = node.dataset.c, i = cg.sel.indexOf(c);
        if(i >= 0) cg.sel.splice(i, 1); else cg.sel.push(c);
        paintCg(); return;
    }
    if(action === "close"){ stopCgTimer(); closeSheet(); return; }
    const map = {draw:["draw", () => ({pos:Number(node.dataset.pos)})], play:["play", () => ({cards:cg.sel.slice()})], pass:["pass", () => ({})],
        raise:["raise", () => ({})], call:["call", () => ({})], fold:["fold", () => ({})], doubt:["doubt", () => ({})], accept:["accept", () => ({})]};
    const m = map[action];
    if(!m) return;
    if(action === "play" && !cg.sel.length){ showToast("出すカードを選んでください。"); return; }
    if(action === "fold" && !confirm("ドロップすると、このラウンドの掛けコインを失います。よいですか？")) return;
    await cgCall("cg_act", {p_game:cg.gid, p_action:m[0], p_arg:m[1]()});
    cg.sel = [];
}

async function cgCall(fn, args){
    const cg = feat.cg;
    if(cg.busy) return;
    cg.busy = true;
    try{
        const result = await requireClient().rpc(fn, args);
        if(result.error) throw result.error;
        cg.view = result.data;
        cgAnnounce(cg.gid, cg.view);
        paintCg();
    }finally{ cg.busy = false; }
}

/** ほかのゲームを始める前に、カードゲームの最新の状態を取り直す（もう終わっていたのに「ゲーム中」と出ないように） */
async function cgFreshenForGuard(){
    const cg = feat.cg;
    if(!cg.gid) return;
    try{ const r = await requireClient().rpc("cg_view", {p_game:cg.gid}); if(!r.error && r.data) cg.view = r.data; }catch(_e){ /* 取れなければ、前の状態のまま */ }
}

function stopCgTimer(){ if(feat.cg.timer){ clearInterval(feat.cg.timer); feat.cg.timer = null; } }

async function openCg(gid){
    const cg = feat.cg;
    cg.gid = gid; cg.view = null; cg.sel = [];
    openSheet('<div id="cgBody" class="admin-card">読み込み中…</div>');
    await cgRefresh();
    stopCgTimer();
    cg.timer = setInterval(() => {
        if(!$("cgBody")){ stopCgTimer(); return; }
        cgRefresh().catch(() => {});
    }, 2500);
}

async function cgRefresh(){
    const cg = feat.cg;
    if(cg.busy) return;
    const result = await requireClient().rpc("cg_view", {p_game:cg.gid});
    if(result.error) throw result.error;
    const before = JSON.stringify(cg.view);
    cg.view = result.data;
    cgAnnounce(cg.gid, cg.view);
    if(JSON.stringify(cg.view) !== before) paintCg();
}

function cgNames(v){ return (v.players || []).map((id) => vsName(id)); }

function paintCg(){
    const box = $("cgBody"), v = feat.cg.view;
    if(!box || !v){ if(box) box.textContent = "ゲームが見つかりません。"; return; }
    const me = state.user.id, info = CG_GAMES[v.game] || {name:"", icon:"🂡"};
    const isPlayer = (v.players || []).includes(me), myTurn = v.status === "playing" && v.turn === me;
    const opp = (v.players || []).find((id) => id !== me), pub = v.pub || {};
    let html = toolHead(info.icon + " " + escapeHtml(info.name), "") ;
    if(v.status === "waiting"){
        html += isPlayer ? '<div class="admin-card">相手が参加するのを待っています…（チャットの「参加・続きを見る」から入ってもらってください）</div>'
            : '<div class="admin-card">2人用です。参加しますか？</div><div class="row"><button type="button" class="button" data-t="cg:join">参加する</button></div>';
        box.innerHTML = html + toolClose(isPlayer ? '<button type="button" class="button-secondary" data-t="cg:end">終了</button>' : '');
        return;
    }
    if(v.status === "done"){
        html += '<div class="admin-card"><b>🏁 ' + escapeHtml(cgResultText(v)) + '</b></div>';
    }else{
        html += '<div class="admin-card">' + (!isPlayer ? "観戦中" : (myTurn ? "<b>あなたの番です</b>" : escapeHtml(vsName(opp)) + " の番です…")) + '</div>';
    }
    const counts = pub.counts || {};
    if(v.game === "baba") html += cgBabaView(v, me, opp, myTurn, counts, pub);
    else if(v.game === "tomo") html += cgTomoView(v, me, opp, myTurn, counts, pub);
    else if(v.game === "uso") html += cgUsoView(v, me, opp, myTurn, counts, pub);
    else html += cgIndianView(v, me, opp, myTurn, pub);
    box.innerHTML = html + toolClose(isPlayer && v.status !== "done" ? '<button type="button" class="button-secondary" data-t="cg:end">終了</button>' : '');
    cgAutoPass(v, myTurn);
}

// 大富豪：出せるカードが1枚もないときは、パスを押さなくても自動でパスします
function cgTomoCanPlay(hand, f){
    if(!f || !f.cards) return true;   // 場が空のときは、好きなカードを出せる
    const n = Number(f.n) || f.cards.length, st = Number(f.strength), count = {};
    (hand || []).forEach((c) => { const r = c === "JK" ? 0 : Number(c.slice(1)); count[r] = (count[r] || 0) + 1; });
    return Object.keys(count).some((key) => { const r = Number(key), strength = r === 0 ? 0 : (r === 1 ? 14 : (r === 2 ? 15 : r)); return count[key] >= n && strength > st; });
}

function cgAutoPass(v, myTurn){
    const cg = feat.cg;
    if(cg.autoTimer){ clearTimeout(cg.autoTimer); cg.autoTimer = null; }
    const f = v.pub && v.pub.field;
    if(v.game !== "tomo" || !myTurn || v.status !== "playing" || !f || !f.cards || cgTomoCanPlay(v.hand, f)) return;
    const attempt = (tries) => {
        cg.autoTimer = setTimeout(async () => {
            cg.autoTimer = null;
            if(!$("cgBody") || cg.view !== v) return;   // 画面が変わっていたら、やめる
            if(cg.busy){ if(tries > 0) attempt(tries - 1); return; }
            try{ await cgCall("cg_act", {p_game:cg.gid, p_action:"pass", p_arg:{}}); showToast("出せるカードがないので、パスしました。"); }catch(error){ showToast(featError(error)); }
        }, tries === 4 ? 1200 : 600);
    };
    attempt(4);
}

function cgHandRow(h, selectable, selected){
    return '<div class="bj-hand">' + cgSortHand(h).map((c) => cgCard(c, selectable ? 'data-t="cg:sel" data-c="' + c + '"' : "disabled", selected.includes(c) ? "picked" : "")).join("") + '</div>';
}

function cgBabaView(v, me, opp, myTurn, counts, pub){
    let html = '<div><b>' + escapeHtml(vsName(opp)) + '</b> の手札（' + (counts[opp] || 0) + '枚）— ' + (myTurn ? "1枚えらんで引く" : "") + '<div class="bj-hand">';
    for(let i = 0; i < (counts[opp] || 0); i++) html += cgBack(myTurn && v.status === "playing" ? 'data-t="cg:draw" data-pos="' + i + '"' : "disabled");
    html += '</div></div><div><b>あなた</b>の手札（' + (counts[me] || 0) + '枚）' + cgHandRow(v.hand, false, []) + '</div>';
    if(pub.last) html += '<div class="meta">直前：' + escapeHtml(vsName(pub.last.by)) + ' が ' + cgLabel(pub.last.card) + ' を引きました' + (pub.last.paired ? "（ペアで捨てた）" : "") + '</div>';
    return html;
}

function cgTomoView(v, me, opp, myTurn, counts, pub){
    const f = pub.field;
    let html = '<div class="meta">' + escapeHtml(vsName(opp)) + ' の手札：' + (counts[opp] || 0) + '枚</div>';
    html += '<div><b>場</b>' + (f && f.cards ? '<div class="bj-hand">' + f.cards.map((c) => cgCard(c, "disabled")).join("") + '</div><div class="meta">' + escapeHtml(vsName(f.by)) + ' が出しました</div>' : '<div class="meta">（なし。好きなカードを出せます）</div>') + '</div>';
    html += '<div><b>あなた</b>の手札（' + (counts[me] || 0) + '枚）' + cgHandRow(v.hand, myTurn, feat.cg.sel) + '</div>';
    if(myTurn && f && f.cards && !cgTomoCanPlay(v.hand, f)) html += '<div class="admin-card">出せるカードがないので、自動でパスします…</div>';
    else if(myTurn) html += '<div class="row"><button type="button" class="button" data-t="cg:play">選んだカードを出す</button>' + (f && f.cards ? '<button type="button" class="button-secondary" data-t="cg:pass">パス</button>' : "") + '</div><div class="meta">同じ数字を同じ枚数で、場より強く。（パスすると場が流れ、出した人が先攻に）</div>';
    return html;
}

function cgUsoView(v, me, opp, myTurn, counts, pub){
    const rank = CG_RANK_LABEL[pub.rank || 1];
    let html = '<div class="meta">' + escapeHtml(vsName(opp)) + ' の手札：' + (counts[opp] || 0) + '枚　場にたまった伏せカード：' + (pub.pile || 0) + '枚</div>';
    html += '<div class="admin-card">いまの数字：<b style="font-size:1.4em">' + rank + '</b></div>';
    if(pub.last && pub.phase === "respond") html += '<div class="meta">' + escapeHtml(vsName(pub.last.by)) + ' が「' + rank + '」を ' + pub.last.n + '枚 出しました</div>';
    if(pub.result && pub.result.doubt) html += '<div class="meta">直前のダウト：' + escapeHtml(vsName(pub.result.by)) + ' → ' + (pub.result.truthful ? "ほんとうでした（ダウトした人が場を全部引き取り）" : "うそでした！（出した人が場を全部引き取り）") + '：' + (pub.result.cards || []).map(cgLabel).join(" ") + '</div>';
    html += '<div><b>あなた</b>の手札（' + (counts[me] || 0) + '枚）' + cgHandRow(v.hand, myTurn && pub.phase === "play", feat.cg.sel) + '</div>';
    if(myTurn && pub.phase === "play") html += '<div class="row"><button type="button" class="button" data-t="cg:play">「' + rank + '」として伏せて出す（1〜4枚）</button></div>';
    if(myTurn && pub.phase === "respond") html += '<div class="row"><button type="button" class="button" data-t="cg:doubt">ダウト！</button><button type="button" class="button-secondary" data-t="cg:accept">信じる</button></div>';
    return html;
}

function cgIndianView(v, me, opp, myTurn, pub){
    const chips = pub.chips || {}, contrib = pub.contrib || {}, last = pub.last;
    let html = '<div class="meta">ラウンド ' + (pub.round || 0) + ' / ' + (pub.rounds || 5) + '　場のコイン：' + (pub.pot || 0) + '</div>' +
        '<div class="meta">コイン：あなた ' + (chips[me] ?? "-") + ' ／ ' + escapeHtml(vsName(opp)) + ' ' + (chips[opp] ?? "-") + '</div>';
    if(v.status === "playing"){
        html += '<div><b>' + escapeHtml(vsName(opp)) + '</b> のカード（見えます）<div class="bj-hand">' + (v.seen || []).map((c) => cgCard(c, "disabled")).join("") + '</div></div>' +
            '<div><b>あなた</b>のカード（見えません）<div class="bj-hand">' + cgBack("disabled") + '</div></div>' +
            '<div class="meta">掛け：あなた ' + (contrib[me] || 0) + ' ／ 相手 ' + (contrib[opp] || 0) + '（上限4）。数字が大きい方が勝ち（A=1が最小、Kが最大）。</div>';
        if(myTurn) html += '<div class="row"><button type="button" class="button" data-t="cg:raise">レイズ（+1）</button><button type="button" class="button-secondary" data-t="cg:call">' + ((contrib[opp] || 0) > (contrib[me] || 0) ? "コール（勝負）" : "勝負する") + '</button><button type="button" class="button-secondary" data-t="cg:fold">ドロップ</button></div>';
    }
    if(last){
        if(last.folded) html += '<div class="admin-card">直前：' + escapeHtml(vsName(last.folded)) + ' がドロップ</div>';
        if(last.showdown) html += '<div class="admin-card">直前の勝負：' + Object.keys(last.cards || {}).map((id) => escapeHtml(vsName(id)) + ' = ' + CG_RANK_LABEL[last.cards[id]]).join(' ／ ') + ' → ' + (last.winner ? escapeHtml(vsName(last.winner)) + " の勝ち" : "引き分け") + '（' + last.pot + 'コイン）</div>';
    }
    return html;
}
