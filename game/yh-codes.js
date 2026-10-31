"use strict";
// ===== やりすぎヒーロー伝説：チート／リプレイ（指紋は yarisugi-codes.js）=====
(function(){
    const isYhFlag = (k) => /^(e_)?(yh|dk)\d/.test(k) || k === "yh_started" || k === "e_yh_all" || k === "dk_started" || k === "e_dk_all";
    const _rf = window.tqReplayFlags;
    window.tqReplayFlags = function(){ return _rf.apply(this, arguments).filter((k) => !isYhFlag(k)); };
    for(let n = 1; n <= 20; n++){
        TQ_REPLAYS.push({id:"rp_yh" + String(n).padStart(2, "0"), n:"🦸 やりすぎヒーロー伝説 第" + n + "話（クリア前まで）", era:"yh" + n, lv:[45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 99, 99, 99, 99, 99, 99, 99, 99, 99][n - 1] });
    }
    for(let n = 1; n <= 10; n++) TQ_REPLAYS.push({id:"rp_dk" + String(n).padStart(2, "0"), n:"📖 出来事 第" + n + "話（クリア前まで）", era:"dk" + n, lv:40});
    for(let i = 1; i <= 20; i++) TQ_WARP_IDS[11 + i] = "yh" + i;
    for(let i = 1; i <= 10; i++) TQ_WARP_IDS[31 + i] = "dk" + i;
    const _rs = window.tqReplayStart;
    window.tqReplayStart = function(id, slot, name){
        const r = _rs.apply(this, arguments);
        const m = /^rp_yh(\d+)$/.exec(id);
        const md = /^rp_dk(\d+)$/.exec(id);
        if(r && r.ok && md && G.S){ const n = parseInt(md[1], 10); for(let k = 1; k < n; k++) G.S.f["e_dk" + k] = 1; if(n > 1) G.S.f.dk_started = 1; tqAutoSave(); render(); }
        if(r && r.ok && m && G.S){
            const n = parseInt(m[1], 10), f = G.S.f;
            for(let k = 1; k < n; k++) f["e_yh" + k] = 1;
            ["e_ks1", "e_ks2", "e_ks3", "e_ks4", "e_ks5"].forEach((k) => { f[k] = 1; });
            if(n > 1) f.yh_started = 1;
            tqAutoSave(); render();
        }
        return r;
    };
    const _ac = _tqApplyBase;
    _tqApplyBase = function(raw){
        const f = tqFindCheat(raw);
        if(!f || !/^y_/.test(f.id) || !G.S) return _ac.apply(this, arguments);
        const S = G.S, c = S.cx; let msg = "";
        switch(f.id){
            case "y_c01": { for(let i = 1; i <= 20; i++) S.f["e_yh" + i] = 1; S.f.yh_started = 1; S.f.e_yh_all = 1; pkYhFinal(); msg = "やりすぎヒーロー伝説を ぜんぶ クリア！ 15職業 Lv99、天才が ひらいた！"; break; }
            case "y_c02": { ["e_future", "e_ks1", "e_ks2", "e_ks3", "e_ks4", "e_ks5"].forEach((k) => { S.f[k] = 1; }); c.allgate = true; S.f.xr_open = 1; msg = "ヒーロー伝説の 第1話が ひらいた！（ゲートへ）"; break; }
            case "y_c03": { const n = f.nums[0]; if(!(n >= 0 && n <= 20)) return {ok:false, msg:"0〜20 を 指定してね。"}; ["e_future", "e_ks1", "e_ks2", "e_ks3", "e_ks4", "e_ks5"].forEach((k) => { S.f[k] = 1; }); for(let i = 1; i <= n; i++) S.f["e_yh" + i] = 1; S.f.yh_started = 1; msg = "第" + n + "話まで クリア扱いに した。"; break; }
            case "y_c04": c.ys = false; msg = tqToggle("yw", "ヒーロー伝説の てき 1/4"); break;
            case "y_c05": c.yw = false; msg = tqToggle("ys", "ヒーロー伝説の てき ×2"); break;
            case "y_c06": { const u = tqGain(1000000); msg = "1,000,000EXP を てにいれた！" + (u.length ? "\n" + u.join("\n") : ""); break; }
            case "y_c07": S.gold = Math.min(TQ_MAX_GOLD, S.gold + 9000000); msg = "9,000,000G を てにいれた！"; break;
            case "y_c08": { const n = f.nums[0]; if(!(n >= 0)) return {ok:false, msg:"金額を 指定してね。"}; S.gold = Math.min(TQ_MAX_GOLD, n); msg = "ゴールドを " + S.gold.toLocaleString() + "G に した。"; break; }
            case "y_c09": Object.keys(RPG_EQUIP).forEach((k) => { if(!S.own.includes(k)) S.own.push(k); }); msg = "そうびを ぜんぶ てにいれた！（" + Object.keys(RPG_EQUIP).length + "こ）"; break;
            case "y_c10": ["e_ks1", "e_ks2", "e_ks3", "e_ks4", "e_ks5"].forEach((k) => { S.f[k] = 1; }); msg = "烏坂探偵事務所①〜⑤を クリア扱いに した。"; break;
            case "y_c11": RPG_ERAS.forEach((e) => { if(!/^yh/.test(e.id) && e.done) S.f[e.done] = 1; }); S.f.xr_open = 1; msg = "ゲートの 時代を ぜんぶ クリア扱いに した。"; break;
            case "y_c12": { const j = tqJ(), d = TQ_JOB_BY[j.cur]; if(!d) return {ok:false, msg:"いま 職業に ついていません。"}; j.jlv = Math.min(99, j.jlv + (f.nums[0] || 1)); j.jexp = 0; d.abil.forEach((a) => { if(j.jlv >= a.lv) j.learned[a.id] = 1; }); msg = "職業レベルが " + j.jlv + " に なった！"; break; }
            case "y_c13": tqHealAll(); msg = "HP・MPが ぜんぶ かいふくした！"; break;
            case "y_c15": { for(let i = 1; i <= 10; i++) S.f["e_dk" + i] = 1; S.f.dk_started = 1; S.f.e_dk_all = 1; S.f.e_future = 1; msg = "出来事 10話を ぜんぶ クリア扱いに した。"; break; }
            case "y_c16": { const n = f.nums[0]; if(!(n >= 0 && n <= 10)) return {ok:false, msg:"0〜10 を 指定してね。"}; S.f.e_future = 1; for(let i = 1; i <= n; i++) S.f["e_dk" + i] = 1; S.f.dk_started = 1; msg = "出来事 第" + n + "話まで クリア扱いに した。"; break; }
            case "y_c14": { const y = S.yh; if(y && y.bench){ y.bench.forEach((id) => { try{ tqAddMember(id, true); }catch(_e){} }); y.bench = []; } msg = "ベンチの なかまを もどした。"; break; }
            default: return _ac.apply(this, arguments);
        }
        try{ tqTitleCheck(true); }catch(_e){}
        tqAutoSave(); return {ok:true, msg};
    };
})();
