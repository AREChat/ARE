"use strict";
// ===== サブストーリー：ゲートの 行き先・称号・チート／リプレイ =====
(function(){
    const MAIN_ORDER = ["sendai", "tokyo", "white", "xmas", "labn", "n8", "n9", "n10", "n11", "future"];
    const MAIN = {};   // key → 親Map の クリアフラグ
    SUB_MAPS.forEach((s, i) => { MAIN[s[0]] = "e_" + s[1]; });
    SUB_MAPS.forEach((s, i) => {
        const key = s[0];
        for(let n = 1; n <= s[3]; n++){
            const e = LD_EPS[key][n - 1]; if(!e) continue;
            RPG_ERAS.push({id:key + n, n:"任意：Map" + (MAIN_ORDER.indexOf(s[1]) + 1) + "サブ『" + s[4] + "』第" + n + "話 " + e.title + "（推奨 Lv" + e.lv + "）", map:key + n, pos:[9, 10], done:"e_" + key + n, req: n === 1 ? MAIN[key] : "e_" + key + (n - 1)});
        }
    });
    const xe = RPG_ERAS.find((e) => e.id === "xr"); if(xe){ RPG_ERAS.splice(RPG_ERAS.indexOf(xe), 1); RPG_ERAS.push(xe); }
    const F = (k) => () => !!G.S.f[k];
    SUB_MAPS.forEach((s, i) => {
        const t = {id:"t_" + s[0], n:"Map" + (MAIN_ORDER.indexOf(s[1]) + 1) + "サブ『" + s[4] + "』かんけつ", d:"『" + s[4] + "』を ぜんぶ クリア", f:F("e_" + s[0] + "_all"), g:2000 + i * 600}; TQ_TITLES.push(t); TQ_TITLE_BY[t.id] = t;
    });
    const all = {id:"t_sub_all", n:"サブストーリー マスター", d:"Map1〜10の サブストーリーを ぜんぶ クリア", f:() => SUB_MAPS.every((s) => G.S.f["e_" + s[0] + "_all"]), g:40000}; TQ_TITLES.push(all); TQ_TITLE_BY[all.id] = all;
    Object.keys(RPG_EV).filter((k) => /^ss[a-j]\d/.test(k)).forEach((k) => {
        const walk = (a) => { if(!Array.isArray(a)) return; if(a[0] === "say" && typeof a[1] === "string" && a[1] && !TQ_PORTRAIT_LOOK[a[1]]) yPortrait(a[1]); a.forEach(walk); };
        walk(RPG_EV[k]);
    });
    // ---- なかまを ふやす（チート用・最大8人）----
    const POOL = ["haruki", "akito", "kaito", "n001", "n002", "n003", "n004"];
    window.tqPartyTo = function(n){
        const S = G.S; n = Math.max(1, Math.min(8, n));
        POOL.forEach((id) => { if(S.party.length < n && !S.party.includes(id)) tqAddMember(id, true); });
        while(S.party.length > n){ const i = S.party.map((x, k) => [x, k]).reverse().find(([x]) => x !== "hero"); if(!i) break; S.party.splice(i[1], 1); }
        tqHealAll(); return S.party.length;
    };
    // ---- ひみつの コード ----
    const isSubFlag = (k) => /^(e_)?ss[a-j]/.test(k) || /^ss[a-j]_started$/.test(k);
    const _rf = window.tqReplayFlags;
    window.tqReplayFlags = function(){ return _rf.apply(this, arguments).filter((k) => !isSubFlag(k)); };
    // リプレイ：話数の 区切り
    const RP = {ssa:[1, 6, 11, 16], ssb:[1, 6, 11, 16], ssc:[1, 6, 11, 16], sse:[1, 6], ssf:[1, 6], ssg:[1, 6], ssh:[1, 6], ssi:[1, 6], ssj:[1, 6]};
    window.SUB_RP = RP;
    SUB_MAPS.forEach((s, i) => { RP[s[0]].forEach((n) => TQ_REPLAYS.push({id:"rp_" + s[0] + String(n).padStart(2, "0"), n:"🗺️ Map" + (MAIN_ORDER.indexOf(s[1]) + 1) + "サブ『" + s[4] + "』第" + n + "話から", era:s[0] + n, lv:(LD_EPS[s[0]][n - 1] || {}).lv || 30})); });
    // ワープ：72〜
    let wi = 72; SUB_MAPS.forEach((s) => { for(let n = 1; n <= s[3]; n++) TQ_WARP_IDS[wi++] = s[0] + n; });
    const mainOf = (key) => SUB_MAPS.find((x) => x[0] === key)[1];
    const openMain = (S, upto) => { for(let i = 0; i < upto; i++) S.f["e_" + MAIN_ORDER[i]] = 1; if(upto > 0) S.f.intro_done = 1; };
    const setSub = (S, key, upto) => { for(let i = 1; i <= upto; i++) S.f["e_" + key + i] = 1; if(upto > 0) S.f[key + "_started"] = 1; if(upto >= SUB_MAPS.find((x) => x[0] === key)[3]) S.f["e_" + key + "_all"] = 1; };
    const _rs = window.tqReplayStart;
    window.tqReplayStart = function(id){
        const r = _rs.apply(this, arguments);
        const m = /^rp_(ss[a-j])(\d+)$/.exec(id);
        if(r && r.ok && m && G.S){
            const key = m[1], n = parseInt(m[2], 10), idx = SUB_MAPS.findIndex((x) => x[0] === key);
            openMain(G.S, idx + 1);
            setSub(G.S, key, n - 1);
            tqAutoSave(); render();
        }
        return r;
    };
    const _ac = _tqApplyBase;
    _tqApplyBase = function(raw){
        const f = tqFindCheat(raw);
        if(!f || !/^y_c(2[2-7])$/.test(f.id) || !G.S) return _ac.apply(this, arguments);
        const S = G.S; let msg = "";
        switch(f.id){
            case "y_c22": { openMain(S, 10); SUB_MAPS.forEach((s) => setSub(S, s[0], s[3])); msg = "Map1〜10の サブストーリー 120話を ぜんぶ クリア扱いに した。"; break; }
            case "y_c23": { openMain(S, 10); msg = "Map1〜10の サブストーリーが ぜんぶ ひらいた！（ゲートへ）"; break; }
            case "y_c24": { const n = f.nums[0]; if(!(n >= 0 && n <= 10)) return {ok:false, msg:"0〜10 を 指定してね。"}; openMain(S, n); msg = "Map" + n + "まで クリア扱いに した。サブストーリーが ひらいたよ。"; break; }
            case "y_c25": { const v = f.nums[0], mi = Math.floor(v / 100), ep = v % 100, s = SUB_MAPS.find((x) => x[1] === MAIN_ORDER[mi - 1]); if(!s || ep < 0 || ep > s[3]) return {ok:false, msg:"例：subskip0105 ＝ Map1の 5話まで。（Map2桁＋話数2桁）"}; openMain(S, mi); setSub(S, s[0], ep); msg = "Map" + mi + "サブ『" + s[4] + "』を " + ep + "話まで クリア扱いに した。"; break; }
            case "y_c26": { const n = f.nums[0]; if(!(n >= 1 && n <= 8)) return {ok:false, msg:"1〜8 を 指定してね。"}; tqPartyTo(n); msg = "なかまが " + S.party.length + "人に なった！（最大8人）"; break; }
            case "y_c27": { tqPartyTo(4); msg = "なかまを 4人に もどした。"; break; }
            default: return _ac.apply(this, arguments);
        }
        try{ tqTitleCheck(true); }catch(_e){}
        tqAutoSave(); return {ok:true, msg};
    };
})();
