"use strict";
// ===== すれ違いタウン：町の成長・ミッション・バッジ =====
// ・町（絵）は「すれ違った人の数」で育ちます。称号（PB_LEVELS）が上がるたびに、建物や景色がふえます（すべて このアプリのオリジナルの絵）。
// ・ミッション：毎日3つ（日本時間の0時でリセット）＋ずっと続く目標。ポイントは、サーバーが数えなおして確かめてから渡します（passby_claim_mission_v1）。
// ・バッジ：ずっと続く目標を達成すると もらえます（ポイントを うけとる前でも、達成したら バッジは点灯します）。
// ・新しい仕組みは、サーバーの関数 passby_missions_v1 / passby_claim_mission_v1 が ある ときだけ 出ます（なければ 町の絵だけ出ます）。
const PBT_MIS = {
    d_meet1:  ["🚶", "きょう 1回 すれ違う"],
    d_meet3:  ["🚶‍♀️", "きょう 3回 すれ違う"],
    d_new1:   ["🆕", "きょう はじめましての人と すれ違う"],
    l_u1:     ["👋", "はじめて すれ違う", "はじめの一歩"],
    l_u5:     ["🏠", "5人と すれ違う", "顔見知り"],
    l_u15:    ["🛍️", "15人と すれ違う", "まちの人気者"],
    l_u30:    ["⛲", "30人と すれ違う", "広場の名人"],
    l_u60:    ["🗼", "60人と すれ違う", "町のレジェンド"],
    l_u120:   ["🏰", "120人と すれ違う", "伝説の旅人"],
    l_s3:     ["🔥", "3日 れんぞくで すれ違う", "3日れんぞく"],
    l_s7:     ["🌈", "7日 れんぞくで すれ違う", "1週間れんぞく"],
    l_s30:    ["🌟", "30日 れんぞくで すれ違う", "30日れんぞく"],
    l_friend: ["🤝", "友だちと すれ違う", "友だち発見"],
    l_qr:     ["📷", "かざし合いで すれ違う", "かざし合い"],
    l_rep5:   ["🔁", "同じ人と 5回 すれ違う", "なかよし"]
};
const PBT_DAILY = ["d_meet1", "d_meet3", "d_new1"];
const PBT_LIFE = ["l_u1", "l_u5", "l_u15", "l_u30", "l_u60", "l_u120", "l_s3", "l_s7", "l_s30", "l_friend", "l_qr", "l_rep5"];
const PBT_STAGE_NOTE = ["草原に 立て札が ひとつ", "はじめての おうちが たちました", "おうちが ふえて 町らしくなりました", "お店と 公園が できました", "広場に 噴水が わきました", "時計塔と 川に 橋が かかりました", "お城と にじの かかる 伝説の町！"];

/** すれ違いタウンの いちばん上の画面に 足す ボタン */
const pbTownMenu = (hasMis, claimable) => '<button type="button" data-t="pbt:town">🏘 町のようす</button>' + (hasMis ? '<button type="button" data-t="pbt:mis">🎯 ミッション' + (claimable ? "（うけとれる " + claimable + "）" : "") + '</button>' : "");

const pbtStage = (n) => { let s = 0; PB_LEVELS.forEach((l, i) => { if(n >= l[0]) s = i; }); return s; };

/** 町の絵（stage 0〜6、done＝完成したかけらパズルの数 → 花がふえる）。ぜんぶ アプリのオリジナル */
function pbtTownSvg(stage, done){
    const h = (x, w, ht, wall, roof) => '<rect x="' + x + '" y="' + (112 - ht) + '" width="' + w + '" height="' + ht + '" fill="' + wall + '"/><polygon points="' + (x - 4) + "," + (112 - ht) + " " + (x + w / 2) + "," + (112 - ht - 18) + " " + (x + w + 4) + "," + (112 - ht) + '" fill="' + roof + '"/>' +
        '<rect x="' + (x + w / 2 - 4) + '" y="' + (112 - 14) + '" width="8" height="14" fill="#7a4a2b"/><rect x="' + (x + 5) + '" y="' + (112 - ht + 9) + '" width="8" height="8" fill="#fff4b8"/><rect x="' + (x + w - 13) + '" y="' + (112 - ht + 9) + '" width="8" height="8" fill="#fff4b8"/>';
    const tree = (x, k) => '<rect x="' + (x - 2) + '" y="' + (112 - 16 * k) + '" width="4" height="' + 16 * k + '" fill="#6b4a2e"/><circle cx="' + x + '" cy="' + (112 - 20 * k) + '" r="' + 11 * k + '" fill="#3f9a56"/>';
    let s = '<defs><linearGradient id="pbtSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + (stage >= 6 ? "#ffb8d9" : "#8fd0ff") + '"/><stop offset="1" stop-color="' + (stage >= 6 ? "#fff0c8" : "#e6f6ff") + '"/></linearGradient></defs>' +
        '<rect width="300" height="160" fill="url(#pbtSky)"/><circle cx="262" cy="30" r="15" fill="#fff4a8"/>' +
        '<ellipse cx="60" cy="32" rx="26" ry="8" fill="#fff" opacity=".85"/><ellipse cx="86" cy="38" rx="20" ry="7" fill="#fff" opacity=".85"/>' +
        '<rect y="112" width="300" height="48" fill="#79c76c"/><rect y="112" width="300" height="5" fill="#69b95d"/>';
    if(stage >= 5) s += '<rect y="132" width="300" height="14" fill="#6bb6f2"/><rect x="118" y="126" width="64" height="8" rx="3" fill="#b88a5a"/><rect x="126" y="134" width="5" height="12" fill="#8b6a40"/><rect x="169" y="134" width="5" height="12" fill="#8b6a40"/>';
    s += '<path d="M0 152 Q150 ' + (stage >= 5 ? 118 : 128) + ' 300 152 L300 160 L0 160z" fill="#d9c391" opacity="' + (stage >= 1 ? 1 : 0) + '"/>';
    if(stage === 0) s += tree(40, 1.1) + tree(250, 0.9) + '<rect x="146" y="88" width="5" height="26" fill="#7a4a2b"/><rect x="128" y="76" width="42" height="18" rx="3" fill="#f3d9a0" stroke="#b08a50"/><text x="149" y="89" text-anchor="middle" font-size="9" fill="#5a3b24">タウン</text>';
    if(stage >= 1) s += h(130, 38, 30, "#ffe0b8", "#d9534f");
    if(stage >= 2) s += tree(40, 1.1) + h(70, 32, 26, "#cfe8ff", "#4d7fc0") + h(190, 34, 28, "#ffd6e0", "#8a5ac0") + '<rect x="222" y="100" width="3" height="14" fill="#6b4a2e"/><rect x="218" y="94" width="11" height="8" rx="2" fill="#d9534f"/>';
    if(stage >= 3) s += '<rect x="20" y="84" width="40" height="28" fill="#fff3c4"/><path d="M16 84h48l-4 12H20z" fill="#e8734a"/><path d="M22 84v12M32 84v12M42 84v12M52 84v12" stroke="#fff" stroke-width="4" opacity=".9"/><rect x="242" y="86" width="38" height="26" fill="#d8f2d0"/><path d="M238 86h46l-4 11h-38z" fill="#3a9a6a"/>' +
        '<rect x="106" y="90" width="3" height="24" fill="#555"/><circle cx="107.5" cy="89" r="4" fill="#ffe27a"/><rect x="62" y="108" width="28" height="4" rx="2" fill="#a07850"/>';
    if(stage >= 4) s += '<ellipse cx="150" cy="130" rx="30" ry="9" fill="#cfd8e8"/><ellipse cx="150" cy="128" rx="22" ry="6" fill="#7fc4f2"/><rect x="148" y="112" width="4" height="16" fill="#cfd8e8"/>' +
        '<path d="M150 112 Q140 100 134 112M150 112 Q160 100 166 112" stroke="#bfe6ff" stroke-width="2.4" fill="none"/><path d="M150 112 Q150 98 150 98" stroke="#bfe6ff" stroke-width="2.4"/>' +
        '<polygon points="14,60 14,84 36,72" fill="#ff6b8b"/><rect x="12" y="58" width="3" height="40" fill="#6b4a2e"/>';
    if(stage >= 5) s += '<rect x="270" y="46" width="22" height="66" fill="#e8dcc0"/><polygon points="266,46 281,26 296,46" fill="#c0504d"/><circle cx="281" cy="62" r="7" fill="#fff"/><path d="M281 62v-5M281 62l4 2" stroke="#444" stroke-width="1.4"/>';
    if(stage >= 6){
        ["#ff5d5d", "#ffa24d", "#ffe45d", "#5dd27a", "#5da8ff", "#8b6bff"].forEach((c, k) => { s += '<path d="M' + (12 + k * 4) + ' 112A' + (92 - k * 4) + ' ' + (92 - k * 4) + ' 0 0 1 ' + (180 - k * 4) + ' 112" fill="none" stroke="' + c + '" stroke-width="4" opacity=".6"/>'; });
        s += '<rect x="196" y="62" width="62" height="50" fill="#e9e1f5"/><rect x="190" y="52" width="14" height="60" fill="#d9cdee"/><rect x="250" y="52" width="14" height="60" fill="#d9cdee"/><polygon points="187,52 197,34 207,52" fill="#8a5ac0"/><polygon points="247,52 257,34 267,52" fill="#8a5ac0"/><path d="M216 112v-16a11 11 0 0 1 22 0v16z" fill="#7a4a8a"/>';
        for(let k = 0; k < 9; k++) s += '<circle cx="' + ((k * 37 + 20) % 280 + 8) + '" cy="' + ((k * 23 + 10) % 50 + 6) + '" r="1.8" fill="#fff8c0"/>';
    }
    const fl = ["#ff6b8b", "#ffd24d", "#ffffff", "#c58bff", "#ff9f4d", "#5da8ff"];
    for(let k = 0; k < done * 3 + (stage >= 1 ? 2 : 0); k++){ const x = (k * 47 + 13) % 290 + 5, y = 122 + (k * 29) % 30; s += '<circle cx="' + x + '" cy="' + y + '" r="2.6" fill="' + fl[k % 6] + '"/><circle cx="' + x + '" cy="' + y + '" r="1" fill="#ffd24d"/>'; }
    return '<svg viewBox="0 0 300 160" role="img" aria-label="すれ違いタウンの町（' + escapeHtml(PB_LEVELS[stage][1]) + '）" style="display:block;width:100%;height:auto">' + s + '</svg>';
}

const pbtBar = (have, need) => '<div class="pbt-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + need + '" aria-valuenow="' + Math.min(have, need) + '"><i style="width:' + Math.max(0, Math.min(100, Math.round(have * 100 / need))) + '%"></i></div>';

// ミッションの一覧（サーバーの関数が ないとき・お試しのときは null）
async function pbtMissions(){
    try{
        const r = await pbRpc("passby_missions_v1");
        if(!r || r.ok === false || !Array.isArray(r.missions)) return null;
        const m = {}; r.missions.forEach((x) => { m[x.id] = x; });
        return m;
    }catch(e){ if(!pbMissing(e)) console.error("[ARE passby-town]", e); return null; }
}
const pbtClaimable = (m) => m ? Object.keys(m).filter((k) => m[k] && !m[k].claimed && m[k].have >= m[k].need).length : 0;

// ---------- 町のようす ----------
async function openPbTown(){
    openSheet(toolHead("🏘 すれ違いタウンの町", "すれ違った人がふえるほど、町が育ちます") + '<div class="meta">読み込み中…</div>');
    const [stats, mis] = await Promise.all([pbRpc("passby_stats_v1"), pbtMissions()]);
    if(!stats || stats.ok === false){ closeSheet(); showToast("いまは使えません。"); return; }
    const have = new Set((stats.pieces || []).map((p) => p.piece));
    const done = [0, 1, 2, 3, 4, 5].filter((s) => [0, 1, 2, 3, 4, 5, 6, 7, 8].every((k) => have.has(s * 9 + k))).length;
    const stage = pbtStage(stats.unique), nx = pbNextLevel(stats.unique);
    const from = PB_LEVELS[stage][0];
    const badges = PBT_LIFE.map((id) => {
        const m = mis && mis[id], ok = !!m && (m.claimed || m.have >= m.need), d = PBT_MIS[id];
        return '<div class="pbt-badge' + (ok ? " on" : "") + '" title="' + escapeHtml(d[1]) + '"><span>' + (ok ? d[0] : "🔒") + '</span><small>' + escapeHtml(d[2]) + '</small></div>';
    }).join("");
    const setBadges = PB_SETS.map((nm, i) => {
        const ok = [0, 1, 2, 3, 4, 5, 6, 7, 8].every((k) => have.has(i * 9 + k));
        return '<div class="pbt-badge' + (ok ? " on" : "") + '" title="' + escapeHtml(nm + " を 完成") + '"><span>' + (ok ? "🧩" : "🔒") + '</span><small>' + escapeHtml(nm) + '</small></div>';
    }).join("");
    const cl = pbtClaimable(mis);
    openSheet(toolHead("🏘 すれ違いタウンの町", "すれ違った人がふえるほど、町が育ちます") +
        '<div class="pbt-town">' + pbtTownSvg(stage, done) + '</div>' +
        '<div style="text-align:center;margin-top:6px"><b>' + escapeHtml(PB_LEVELS[stage][1]) + '</b> <span class="meta">（町のレベル ' + (stage + 1) + ' / ' + PB_LEVELS.length + '）</span><div class="meta">' + escapeHtml(PBT_STAGE_NOTE[stage]) + '</div></div>' +
        (nx ? '<div class="meta" style="margin-top:6px">つぎの「' + escapeHtml(nx[1]) + '」まで：あと <b>' + (nx[0] - stats.unique) + '</b> 人</div>' + pbtBar(stats.unique - from, nx[0] - from) : '<div class="meta" style="margin-top:6px;text-align:center">🎉 町は これいじょう ないほど 育ちました！ いつも ありがとう</div>') +
        '<div class="pb-stats"><div><b>' + stats.unique + '</b><small>すれ違った人</small></div><div><b>' + stats.meets + '</b><small>ぜんぶで</small></div><div><b>' + stats.streak + '</b><small>れんぞく日</small></div><div><b>' + done + '/6</b><small>パズル完成</small></div></div>' +
        (mis ? '<div class="row"><button type="button" data-t="pbt:mis">🎯 ミッション' + (cl ? "（うけとれる " + cl + "）" : "") + '</button></div>' : "") +
        '<div class="meta" style="margin-top:8px">🏅 バッジ（目標を達成すると 点灯します）</div><div class="pbt-badges">' + badges + '</div>' +
        '<div class="meta" style="margin-top:6px">🧩 かけらパズルの バッジ</div><div class="pbt-badges">' + setBadges + '</div>' +
        '<div class="row"><button type="button" class="button-secondary" data-t="pb:main">← もどる</button><button type="button" class="button-secondary" data-pm="close">閉じる</button></div>');
}

// ---------- ミッション ----------
function pbtMissionCard(m, id){
    const d = PBT_MIS[id], ok = m.have >= m.need;
    const btn = m.claimed ? '<span class="pbt-done">✅ うけとりずみ</span>'
        : ok ? '<button type="button" data-t="pbt:mclaim" data-id="' + id + '">🎁 +' + m.reward + ' うけとる</button>'
        : '<span class="meta">+' + m.reward + ' ポイント</span>';
    return '<div class="admin-card pbt-mis' + (m.claimed ? " done" : "") + '"><div class="pbt-mis-h"><span class="pbt-mis-ic">' + d[0] + '</span><div class="pbt-mis-t"><b>' + escapeHtml(d[1]) + '</b><div class="meta">' + Math.min(m.have, m.need) + ' / ' + m.need + '</div></div><div class="pbt-mis-b">' + btn + '</div></div>' + (m.claimed ? "" : pbtBar(m.have, m.need)) + '</div>';
}
async function openPbMissions(){
    openSheet(toolHead("🎯 ミッション", "達成したら、自分で「うけとる」を押すと ポイントがもらえます") + '<div class="meta">読み込み中…</div>');
    const mis = await pbtMissions();
    if(!mis){ closeSheet(); showToast("ミッションは、いまは使えません（準備中か、お試しアカウントです）。"); return; }
    const life = PBT_LIFE.filter((id) => mis[id]);
    const open = life.filter((id) => !mis[id].claimed), got = life.filter((id) => mis[id].claimed);
    openSheet(toolHead("🎯 ミッション", "達成したら、自分で「うけとる」を押すと ポイントがもらえます") +
        '<div class="meta" style="margin-top:6px">☀️ きょうのミッション（日本時間の0時に リセット）</div>' + PBT_DAILY.filter((id) => mis[id]).map((id) => pbtMissionCard(mis[id], id)).join("") +
        '<div class="meta" style="margin-top:10px">🏁 ずっと続く目標（1回だけ）</div>' + (open.length ? open.map((id) => pbtMissionCard(mis[id], id)).join("") : '<div class="admin-card"><div class="meta">ぜんぶ うけとりました！ すごい！</div></div>') +
        (got.length ? '<div class="meta" style="margin-top:10px">✅ うけとりずみ（' + got.length + '）</div>' + got.map((id) => pbtMissionCard(mis[id], id)).join("") : "") +
        '<div class="meta" style="margin-top:8px">・数は、サーバーで 数えなおして 確かめます。<br>・「記録をぜんぶ消す」をしても、うけとりずみの目標は くり返し もらえません。</div>' +
        '<div class="row"><button type="button" class="button-secondary" data-t="pbt:town">🏘 町へ</button><button type="button" class="button-secondary" data-t="pb:main">← もどる</button><button type="button" class="button-secondary" data-pm="close">閉じる</button></div>');
}
async function pbtClaim(id){
    const r = await pbRpc("passby_claim_mission_v1", {p_id:String(id || "")});
    showToast(r && r.ok ? (r.gained > 0 ? "🎁 ポイントを " + r.gained + " もらいました！" : "うけとりました（きょうの上限のため ポイントは 0 でした）。")
        : r && r.error === "already" ? "もう うけとっています。" : r && r.error === "not_complete" ? "まだ 達成していません。" : r && r.error === "guest" ? "お試しアカウントでは 使えません。" : "うけとれませんでした。");
    await openPbMissions();
}

async function onPbTownAction(action, node){
    if(action === "town") await openPbTown();
    else if(action === "mis") await openPbMissions();
    else if(action === "mclaim") await pbtClaim(node.dataset.id);
    else if(action === "filt") pbInboxFilter(node.dataset.f);
}
function initPassbyTown(){ registerTool("pbt", onPbTownAction); }
