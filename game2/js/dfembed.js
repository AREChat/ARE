// ===== ドリーム・フロンティア（別フォルダの 3D テーマパーク）を ARE QUEST 2 の 中に ひらく =====
//  dream-frontier/ が 見つからない時は null を かえす → よびだしもとが 内蔵の ミニパーク（park.js）に きりかえる
const CANDS = ["../dream-frontier/index.html", "dream-frontier/index.html"];
async function find(){ for(const c of CANDS){ try{ const r = await fetch(c, {method: "HEAD", cache: "no-store"}); if(r.ok) return c; }catch(_e){} } return null; }
export async function openDreamFrontier(ctx){
    const url = await find(); if(!url) return null;
    const S = ctx.S; S.df = S.df || {stamps: {}, done: false};
    return new Promise((resolve) => {
        const ov = document.createElement("div"); ov.id = "dfOverlay"; ov.style.cssText = "position:fixed;inset:0;z-index:9000;background:#000";
        const fr = document.createElement("iframe"); fr.src = url + "?embed=1&name=" + encodeURIComponent(S.name || ""); fr.allow = "fullscreen; autoplay"; fr.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0"; fr.title = "ドリーム・フロンティア";
        const x = document.createElement("button"); x.textContent = "✕ まちへ もどる"; x.style.cssText = "position:absolute;right:8px;bottom:6px;z-index:2;font:700 12px sans-serif;padding:5px 10px;border-radius:10px;border:2px solid #fff;background:rgba(32,24,80,.8);color:#fff;opacity:.85";
        ov.append(fr, x); document.body.appendChild(ov);
        const prev = ctx.getState(); ctx.setState("busy"); try{ ctx.A && ctx.A.stopBgm && ctx.A.stopBgm(); }catch(_e){}
        const reward = (m) => {
            if(m.ev === "stamp" && m.data && !S.df.stamps[m.data.id]){ S.df.stamps[m.data.id] = 1; S.coins = (S.coins || 0) + 10; ctx.UI.toast && 0; }
            if(m.ev === "complete" && !S.df.done){ S.df.done = true; S.coins = (S.coins || 0) + 300; S.gold = (S.gold || 0) + 500; S.titles = S.titles || []; if(!S.titles.includes("ドリーム全制覇者")) S.titles.push("ドリーム全制覇者"); }
        };
        const onMsg = (e) => { const m = e.data; if(!m || m.source !== "dream-frontier") return; if(m.ev === "exit") close(); else reward(m); };
        const close = () => { removeEventListener("message", onMsg); ov.remove(); ctx.setState("talk"); if(ctx.story) ctx.story.hud(); try{ ctx.UI.toast && ctx.UI.toast("ドリーム・フロンティアから もどった（コイン " + (S.coins || 0) + "）"); }catch(_e){} resolve(true); };
        x.onclick = close; addEventListener("message", onMsg); fr.addEventListener("load", () => { try{ fr.contentWindow.focus(); }catch(_e){} });
    });
}
