"use strict";
// ===== テーマパーク編：ゲートの 行き先・称号・もくてき・チート／リプレイ =====
(function(){
    const LANDS = [["kn", "本編：コイヌネランド", "必須"], ["wn", "任意：ワンコロランド", "任意"], ["us", "任意：ウサウサランド", "任意"]];
    const LV = (land, n) => (LD_EPS[land][n - 1] || {}).lv || 30;
    LANDS.forEach(([land, label]) => {
        for(let i = 1; i <= 10; i++){
            const e = LD_EPS[land][i - 1], req = i > 1 ? "e_" + land + (i - 1) : (land === "kn" ? "e_future" : "e_kn10");
            RPG_ERAS.push({id:land + i, n:label + " 第" + i + "話 " + e.title + "（推奨 Lv" + e.lv + "）", map:land + i, pos:[9, 10], done:"e_" + land + i, req});
        }
    });
    const xe = RPG_ERAS.find((e) => e.id === "xr"); if(xe){ RPG_ERAS.splice(RPG_ERAS.indexOf(xe), 1); RPG_ERAS.push(xe); }
    const F = (k) => () => !!G.S.f[k];
    [["t_kn_all", "コイヌネランド かんけつ！", "コイヌネランド 10話を ぜんぶ クリア", "e_kn10", 6000], ["t_wn_all", "ワンコロランド 全制覇！", "ワンコロランド 10話を ぜんぶ クリア", "e_wn10", 9000], ["t_us_all", "ウサウサランド 完全制覇！", "ウサウサランド 10話を ぜんぶ クリア", "e_us10", 14000]].forEach(([id, n, d, k, g]) => {
        const t = {id, n, d, f:F(k), g}; TQ_TITLES.push(t); TQ_TITLE_BY[id] = t;
    });
    const all = {id:"t_ld_all", n:"テーマパーク マスター", d:"3つの ランドを ぜんぶ クリア", f:() => !!(G.S.f.e_kn10 && G.S.f.e_wn10 && G.S.f.e_us10), g:20000}; TQ_TITLES.push(all); TQ_TITLE_BY[all.id] = all;
    const _obj = tqObjective;
    window.tqObjective = function(){
        const r = _obj(), f = G.S.f;
        if(f.e_future){
            for(let i = 1; i <= 10; i++) if(!f["e_kn" + i]) return "本編：コイヌネランド 第" + i + "話『" + LD_EPS.kn[i - 1].title + "』へ（ゲート）";
        }
        return r;
    };
    Object.keys(RPG_EV).filter((k) => /^(kn|wn|us)\d/.test(k)).forEach((k) => {
        const walk = (a) => { if(!Array.isArray(a)) return; if(a[0] === "say" && typeof a[1] === "string" && a[1] && !TQ_PORTRAIT_LOOK[a[1]]) yPortrait(a[1]); a.forEach(walk); };
        walk(RPG_EV[k]);
    });

    // ---- 隠しコード（リプレイ・チート）----
    const isLdFlag = (k) => /^(e_)?(kn|wn|us)\d/.test(k) || /^(kn|wn|us)_started$/.test(k) || /^e_(kn|wn|us)_all$/.test(k);
    const _rf = window.tqReplayFlags;
    window.tqReplayFlags = function(){ return _rf.apply(this, arguments).filter((k) => !isLdFlag(k)); };
    LANDS.forEach(([land, label]) => {
        const nm = {kn:"コイヌネランド", wn:"ワンコロランド", us:"ウサウサランド"}[land];
        for(let n = 1; n <= 10; n++) TQ_REPLAYS.push({id:"rp_" + land + String(n).padStart(2, "0"), n:"🎡 " + nm + " 第" + n + "話（クリア前まで）", era:land + n, lv:LV(land, n)});
    });
    const base = {kn:42, wn:52, us:62};
    Object.keys(base).forEach((land) => { for(let i = 1; i <= 10; i++) TQ_WARP_IDS[base[land] + i - 1] = land + i; });
    const setLand = (S, land, upto) => { for(let i = 1; i <= upto; i++) S.f["e_" + land + i] = 1; if(upto > 0) S.f[land + "_started"] = 1; if(upto >= 10) S.f["e_" + land + "_all"] = 1; };
    const _rs = window.tqReplayStart;
    window.tqReplayStart = function(id){
        const r = _rs.apply(this, arguments);
        const m = /^rp_(kn|wn|us)(\d+)$/.exec(id);
        if(r && r.ok && m && G.S){
            const land = m[1], n = parseInt(m[2], 10), f = G.S.f;
            f.e_future = 1;
            if(land !== "kn") setLand(G.S, "kn", 10);
            setLand(G.S, land, n - 1);
            tqAutoSave(); render();
        }
        return r;
    };
    const _ac = _tqApplyBase;
    _tqApplyBase = function(raw){
        const f = tqFindCheat(raw);
        if(!f || !/^y_c(1[7-9]|2[0-3])$/.test(f.id) || !G.S) return _ac.apply(this, arguments);
        const S = G.S; let msg = "";
        const pick = (land) => { const n = f.nums[0]; if(!(n >= 0 && n <= 10)) return null; S.f.e_future = 1; if(land !== "kn") setLand(S, "kn", 10); setLand(S, land, n); return n; };
        switch(f.id){
            case "y_c17": { S.f.e_future = 1; ["kn", "wn", "us"].forEach((l) => setLand(S, l, 10)); msg = "コイヌネ・ワンコロ・ウサウサの 30話を ぜんぶ クリア扱いに した。"; break; }
            case "y_c18": { S.f.e_future = 1; setLand(S, "kn", 10); msg = "コイヌネランドを クリア扱いに した。ワンコロ・ウサウサが ひらいたよ！"; break; }
            case "y_c19": { const n = pick("kn"); if(n === null) return {ok:false, msg:"0〜10 を 指定してね。"}; msg = "コイヌネランド 第" + n + "話まで クリア扱いに した。"; break; }
            case "y_c20": { const n = pick("wn"); if(n === null) return {ok:false, msg:"0〜10 を 指定してね。"}; msg = "ワンコロランド 第" + n + "話まで クリア扱いに した。"; break; }
            case "y_c21": { const n = pick("us"); if(n === null) return {ok:false, msg:"0〜10 を 指定してね。"}; msg = "ウサウサランド 第" + n + "話まで クリア扱いに した。"; break; }
            default: return _ac.apply(this, arguments);
        }
        try{ tqTitleCheck(true); }catch(_e){}
        tqAutoSave(); return {ok:true, msg};
    };
})();
