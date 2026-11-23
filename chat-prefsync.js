"use strict";
// ===== 端末をまたいだ設定の同期（どの端末でログインしても、最新の状態になる）=====
// ・これまで「この端末にだけ」保存していた設定（非表示の部屋・下書き・定型文・フォルダ・アバター・自作スタンプ・マイAI・よく使うサイト・
//   自分の画面だけの名前・テーマ・言語・各種のオン/オフ など）を、サーバー（user_prefs）にも保存して、ログインのたびに最新を受け取ります。
// ・仕組み：保存先の localStorage への書き込みを見張り、変わったものだけを 2秒後にサーバーへ送ります（ログアウトの直前は、必ず送り終えてから）。
//   起動時とログイン時に、サーバーの「更新時刻」を見て、新しいほうを採用します（項目ごと。新しいほうが勝つ）。
// ・行（user_prefs）：ls:<名前> = 先頭（{t:更新時刻, v:中身} または {t, n:分割数, len}／消したときは {t, del:1}）、lc:<名前>:<番号> = 長い中身の分割。
//   1行は 20000 バイト未満という決まりがあるので、14000 バイトずつに分けます（1項目 約800KBまで）。
// ・端末ごとの項目（アプリロックの暗証番号・画面サイズ・通知の許可・位置の監視・タイマー・アップロードの再開）は、わざと同期しません。
// ・お試し（ゲスト）は、ログアウトで消えるので、同期しません。
const PS = {
    uid:null, on:false, meta:{}, last:{}, dirty:new Set(), chunks:{}, timer:null, busy:false, applying:false, maxT:0, pulling:false,
    PREFIX:["are_hidden_rooms_","are_avatar_","are_drafts_","are_folders_","are_phrases_","are_mystamps_","are_myai_","are_sites_","are_nick_","are_quick_v1_","are_ann_seen_","are_tips_seen_","are_tips_off_","are_export_last_"],
    GLOBAL:["are_theme","are_lang","are_eco","are_autotheme","are_mood_theme","are_weather_pref","are_weather_place","are_transit_pref","are_smart","are_qs_auto","are_bj_coins","tq_suggest_name","are_emoji_freq_v1","are_manual_status"],
    CHUNK:14000, MAX:800000, DEBOUNCE:2000, POLL:60000
};
const PS_SET = Storage.prototype.setItem, PS_REM = Storage.prototype.removeItem, PS_GET = Storage.prototype.getItem;

function psName(key){
    if(!PS.uid || typeof key !== "string") return null;
    if(PS.GLOBAL.indexOf(key) >= 0) return key;
    for(const p of PS.PREFIX){ if(key === p + PS.uid) return p.slice(0, -1); }
    return null;
}
function psKeyOf(name){
    if(PS.GLOBAL.indexOf(name) >= 0) return name;
    return PS.PREFIX.indexOf(name + "_") >= 0 ? name + "_" + PS.uid : null;
}
function psAllNames(){ return PS.GLOBAL.concat(PS.PREFIX.map((p) => p.slice(0, -1))); }
function psMetaKey(){ return "are_ps_meta_" + PS.uid; }
function psLoadMeta(){ try{ PS.meta = JSON.parse(PS_GET.call(localStorage, psMetaKey()) || "{}") || {}; }catch(_e){ PS.meta = {}; } }
function psSaveMeta(){ try{ PS_SET.call(localStorage, psMetaKey(), JSON.stringify(PS.meta)); }catch(_e){} }
function psNowT(){ return Math.max(Date.now(), PS.maxT + 1); }
function psBytes(s){ try{ return new TextEncoder().encode(s).length; }catch(_e){ return s.length * 3; } }

// 14000バイトずつに分ける（文字の途中では切らない）
function psSplit(s){
    const out = []; let cur = "", n = 0;
    for(const ch of s){
        const b = psBytes(ch);
        if(n + b > PS.CHUNK){ out.push(cur); cur = ""; n = 0; }
        cur += ch; n += b;
    }
    if(cur !== "" || !out.length) out.push(cur);
    return out;
}

function psTouch(key){
    const name = psName(key); if(!name || PS.applying) return;
    const v = PS_GET.call(localStorage, key);
    if(PS.last[name] === (v === null ? null : v)) return;      // 同じ値の書きこみは 送らない
    PS.meta[name] = {t:psNowT(), s:(PS.meta[name] && PS.meta[name].s) || 0};
    PS.dirty.add(name); psSaveMeta(); psSchedule();
}
function psSchedule(){ clearTimeout(PS.timer); PS.timer = setTimeout(() => { psFlush().catch(() => {}); }, PS.DEBOUNCE); }

async function psFlush(){
    if(!PS.on) return;
    clearTimeout(PS.timer);
    while(PS.busy){ try{ await PS.busy; }catch(_e){ /* 前の送信の失敗は、次の送信で やり直す */ } }
    const names = [...PS.dirty]; if(!names.length) return;
    const c = requireClient();
    PS.busy = (async () => {
        for(const name of names){
            const lk = psKeyOf(name); if(!lk) { PS.dirty.delete(name); continue; }
            const m = PS.meta[name] || {t:psNowT(), s:0};
            const val = PS_GET.call(localStorage, lk);
            const now = new Date().toISOString();
            const rows = []; let head, n = 0;
            if(val === null) head = {t:m.t, del:1};
            else if(val.length > PS.MAX){ console.warn("[ARE sync] 大きすぎて同期しません:", name, val.length); PS.dirty.delete(name); continue; }
            else if(psBytes(val) <= PS.CHUNK) head = {t:m.t, v:val};
            else{
                const parts = psSplit(val); n = parts.length;
                parts.forEach((p, i) => rows.push({user_id:PS.uid, key:"lc:" + name + ":" + i, value:p, updated_at:now}));
                head = {t:m.t, n:n, len:val.length};
            }
            rows.push({user_id:PS.uid, key:"ls:" + name, value:head, updated_at:now});
            const r = await c.from("user_prefs").upsert(rows, {onConflict:"user_id,key"});
            if(r && r.error){ console.warn("[ARE sync] 送れませんでした:", name, r.error.message); continue; }   // dirty のまま残し、次の機会に再送
            const old = PS.chunks[name] || 0;
            if(old > n){ const ks = []; for(let i = n; i < old; i++) ks.push("lc:" + name + ":" + i); try{ await c.from("user_prefs").delete().eq("user_id", PS.uid).in("key", ks); }catch(_e){} }
            PS.chunks[name] = n; PS.last[name] = val; PS.meta[name] = {t:m.t, s:m.t}; PS.dirty.delete(name); PS.maxT = Math.max(PS.maxT, m.t);
        }
        psSaveMeta();
    })();
    try{ await PS.busy; } finally{ PS.busy = false; }
    if(PS.dirty.size) psSchedule();
}

async function psFetchValue(c, name, headRow){
    const h = headRow.value || {};
    if(h.del) return {del:true, t:h.t};
    if(typeof h.v === "string") return {v:h.v, t:h.t};
    if(h.n > 0){
        const keys = []; for(let i = 0; i < h.n; i++) keys.push("lc:" + name + ":" + i);
        const r = await c.from("user_prefs").select("key,value").eq("user_id", PS.uid).in("key", keys);
        if(r.error || !r.data) return null;
        const by = {}; r.data.forEach((x) => { by[x.key] = x.value; });
        let s = ""; for(const k of keys){ if(typeof by[k] !== "string") return null; s += by[k]; }
        if(h.len != null && s.length !== h.len) return null;       // 書きかけを読んだ → 今回は採用しない（次の確認で もう一度）
        return {v:s, t:h.t};
    }
    return null;
}

// サーバーの更新時刻を見て、新しいものだけ受け取る／ローカルが新しいものは送る
async function psPull(){
    if(!PS.on || PS.pulling) return [];
    PS.pulling = true;
    const changed = [];
    try{
        const c = requireClient();
        const r = await c.from("user_prefs").select("key,t:value->>t").eq("user_id", PS.uid).like("key", "ls:%");
        if(r.error) throw r.error;
        const heads = {};
        (r.data || []).forEach((x) => { const t = x.t != null ? Number(x.t) : (x.value && Number(x.value.t)); heads[String(x.key).slice(3)] = t || 0; });
        const want = [];
        for(const name of psAllNames()){
            const lk = psKeyOf(name); if(!lk) continue;
            const has = PS_GET.call(localStorage, lk) !== null;
            const m = PS.meta[name], st = heads[name];
            PS.maxT = Math.max(PS.maxT, st || 0);
            if(st === undefined){
                if(has && !PS.dirty.has(name)){ PS.meta[name] = {t:(m && m.t) || psNowT(), s:0}; PS.dirty.add(name); }
            }else if(!m || st > m.t){ want.push(name); }
            else if(m.t > st){ PS.dirty.add(name); }
        }
        for(const name of want){
            const hr0 = await c.from("user_prefs").select("key,value").eq("user_id", PS.uid).eq("key", "ls:" + name).maybeSingle();
            if(hr0.error || !hr0.data) continue;
            const got = await psFetchValue(c, name, hr0.data); if(!got) continue;
            const lk = psKeyOf(name), cur = PS_GET.call(localStorage, lk);
            PS.applying = true;
            try{
                if(got.del){ if(cur !== null){ PS_REM.call(localStorage, lk); changed.push(name); } }
                else if(cur !== got.v){
                    if(cur !== null && !PS.meta[name]){ try{ PS_SET.call(localStorage, "are_ps_bak_" + name, cur); }catch(_e){} }   // はじめての採用で ちがうとき、元の値を とっておく
                    PS_SET.call(localStorage, lk, got.v); changed.push(name);
                }
            }finally{ PS.applying = false; }
            PS.last[name] = got.del ? null : got.v; PS.meta[name] = {t:got.t, s:got.t}; PS.dirty.delete(name); PS.maxT = Math.max(PS.maxT, got.t || 0);
            if(typeof (hr0.data.value || {}).n === "number") PS.chunks[name] = hr0.data.value.n;
        }
        psSaveMeta();
        if(PS.dirty.size) psFlush().catch(() => {});
        if(changed.length) psOnChanged(changed);
    }finally{ PS.pulling = false; }
    return changed;
}

// 受け取った項目を、いま動いている画面にも反映する
function psOnChanged(names){
    try{ window.dispatchEvent(new CustomEvent("are-prefs-synced", {detail:{names:names}})); }catch(_e){}
    try{
        if(names.some((n) => n === "are_theme" || n === "are_autotheme" || n === "are_mood_theme") && typeof applyTheme === "function") applyTheme(prefGet("are_theme", "standard"));
        if(names.indexOf("are_eco") >= 0 && typeof applyEco === "function") applyEco(prefGet("are_eco", "0") === "1");
        if(names.indexOf("are_hidden_rooms") >= 0 && typeof hrLoad === "function"){ hrLoad(); if(typeof hrPaint === "function") hrPaint(); }
        if(names.indexOf("are_lang") >= 0){
            const k = "are_ps_lang_reload";
            let last = 0; try{ last = Number(sessionStorage.getItem(k) || 0); }catch(_e){}
            if(Date.now() - last > 30000){ try{ sessionStorage.setItem(k, String(Date.now())); }catch(_e){} location.reload(); }
        }
    }catch(_e){ /* 反映に失敗しても、保存は済んでいる */ }
}

function prefSyncStart(){
    if(PS.starting) return PS.starting;
    PS.starting = psStart().catch(() => {});
    return PS.starting;
}
async function psStart(){
    if(PS.on || !state || !state.user) return;
    try{
        const g = await requireClient().rpc("guest_status_me");
        if(g && g.data && g.data.guest === true) return;        // お試しは同期しない（ログアウトで消えるため）
    }catch(_e){ /* 判定できなくても、同期は続ける */ }
    PS.uid = state.user.id; psLoadMeta();
    for(const name of psAllNames()){ const lk = psKeyOf(name); PS.last[name] = lk ? PS_GET.call(localStorage, lk) : null; }
    // 同期の前に すでに端末にある値は「サーバーにあるものと比べる」ため、最後に送った記録（meta）がなければ last を空にしておく
    for(const name of psAllNames()){ if(!PS.meta[name]) PS.last[name] = undefined; }
    PS.on = true;
    await psPull();
}
// 端末の書きこみを見張る（localStorage だけ）
Storage.prototype.setItem = function(k, v){ PS_SET.call(this, k, v); if(this === window.localStorage && PS.on && !PS.applying) psTouch(k); };
Storage.prototype.removeItem = function(k){ PS_REM.call(this, k); if(this === window.localStorage && PS.on && !PS.applying) psTouch(k); };

function initPrefSync(){
    prefSyncStart();
    feat.timers.push(setInterval(() => { if(PS.on && !document.hidden) psPull().catch(() => {}); }, PS.POLL));
    document.addEventListener("visibilitychange", () => {
        if(!PS.on) return;
        if(document.hidden) psFlush().catch(() => {}); else psPull().catch(() => {});
    });
    window.addEventListener("pagehide", () => { if(PS.on) psFlush().catch(() => {}); });
}
// system.js の logout() が、サインアウトの直前に呼ぶ（送り終えるまで待つ）
window.ARESync = {
    start:prefSyncStart,
    flush:async () => { if(!PS.on) return; await psFlush(); if(PS.busy) await PS.busy; },
    pull:() => psPull(),
    state:() => ({on:PS.on, dirty:[...PS.dirty], meta:PS.meta})
};
