"use strict";
// ===== 出来事：ゲートの 行き先・称号・もくてき・チート =====
(function(){
    const T = DK_EPS.map((e) => e.title);
    for(let i = 1; i <= 10; i++){
        RPG_ERAS.push({id:"dk" + i, n:"おまけ：出来事 第" + i + "話 " + T[i - 1] + "（クリア後・推奨 Lv30〜）", map:"dk" + i, pos:[9, 10], done:"e_dk" + i, req: i === 1 ? "e_future" : "e_dk" + (i - 1)});
    }
    const xe = RPG_ERAS.find((e) => e.id === "xr"); if(xe){ RPG_ERAS.splice(RPG_ERAS.indexOf(xe), 1); RPG_ERAS.push(xe); }
    const F = (k) => () => !!G.S.f[k];
    for(let i = 1; i <= 10; i++){
        const t = {id:"t_dk" + i, n:"出来事 第" + i + "話", d:"出来事 第" + i + "話を クリア", f:F("e_dk" + i), g:300 + i * 80}; TQ_TITLES.push(t); TQ_TITLE_BY[t.id] = t;
    }
    const all = {id:"t_dk_all", n:"出来事 かんけつ！", d:"出来事 10話を ぜんぶ クリア", f:F("e_dk10"), g:8000}; TQ_TITLES.push(all); TQ_TITLE_BY[all.id] = all;
    const _obj = tqObjective;
    window.tqObjective = function(){
        const r = _obj(), f = G.S.f;
        if(/^(クリア おめでとう|ぜんぶ クリア)/.test(r)){
            for(let i = 1; i <= 10; i++) if(!f["e_dk" + i]) return "おまけ：出来事 第" + i + "話『" + T[i - 1] + "』へ（ゲート）";
        }
        return r;
    };
    Object.keys(RPG_EV).filter((k) => /^dk/.test(k)).forEach((k) => {
        const walk = (a) => { if(!Array.isArray(a)) return; if(a[0] === "say" && typeof a[1] === "string" && a[1] && !TQ_PORTRAIT_LOOK[a[1]]) yPortrait(a[1]); a.forEach(walk); };
        walk(RPG_EV[k]);
    });
})();
