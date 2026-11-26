import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
game = sys.argv[1]
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=960, height=640, touch=False)
    page.goto(f"{BASE}/" + {"game2":"game2/quest2","game3":"game2/quest3"}.get(game,game) + "/index.html", wait_until="load"); page.wait_for_timeout(4000)
    check("タイトルが出る", page.evaluate("__q2.state") == "title", page.evaluate("__q2.state"))
    page.evaluate("void __q2.begin('テスト')")
    ok = page.evaluate("__q2.waitState('field', 40000)")
    # 会話などで止まる場合は Enter を送る
    for _ in range(40):
        if page.evaluate("__q2.state") == "field": break
        page.keyboard.press("Enter"); page.wait_for_timeout(300)
    s = page.evaluate("({state: __q2.state, name: __q2.S && __q2.S.name, chapter: __q2.S && __q2.S.chapter, gold: __q2.S && __q2.S.gold})")
    check("はじめから → 操作できる状態（field）になる", s["state"] == "field" and s["name"] == "テスト", s)
    page.screenshot(path=f"/tmp/are-e2e/shots_games/{game}_1field.png")
    p0 = page.evaluate("({x: __q2.P().x, z: __q2.P().z})")
    for k in ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"]:
        page.keyboard.down(k); page.wait_for_timeout(1500); page.keyboard.up(k)
    p1 = page.evaluate("({x: __q2.P().x, z: __q2.P().z})")
    check("キーで歩ける（位置が変わる）", (p0["x"], p0["z"]) != (p1["x"], p1["z"]), (p0, p1))
    # チート
    has_cheats = page.evaluate("typeof __q2.cheatCtx === 'function'")
    if game == "game3":
        out = page.evaluate("""async () => {
            const m = await import('/game2/quest3/js/cheats.js'); const c = __q2.cheatCtx(); const snap = JSON.stringify(__q2.S);
            const res = {total: 0, bad: [], names: Object.keys(m.CODES)};
            const skip = new Set(['BOSSRUSH', 'RESCUE', 'SAVEME']);
            for(const k of res.names){
                if(skip.has(k)) continue;
                res.total++;
                try{ const r = m.run(k, c); if(!r || /うまく かからなかった|そんな コードは ない|ゲームを はじめてから/.test(r)) res.bad.push(k + ' → ' + r); }catch(e){ res.bad.push(k + ' ✗ ' + e.message); }
            }
            for(const k of ['CH:2', 'GOLD:500', 'LV:5', 'ZZZ']){ try{ res[k] = m.run(k, c); }catch(e){ res[k] = 'EXC ' + e.message; } }
            res.helpLines = m.helpText().split('\\n').length;
            return res;
        }""")
        print("   チート:", json.dumps({k: out[k] for k in out if k != 'names'}, ensure_ascii=False)[:600])
        check("チート36個（うち一部は別枠で確認）が例外なく動く", not out["bad"], out["bad"][:5])
        check("説明の一覧（ひみつのコード画面）に全コードが載っている", out["helpLines"] >= len(out["names"]), (out["helpLines"], len(out["names"])))
        check("存在しないコードは断られる", "そんな" in out["ZZZ"], out["ZZZ"])
        page.wait_for_timeout(500)
    # 保存→再読込→つづきから
    page.evaluate("__q2.S.gold = 4321; __q2.Save.write('1', __q2.S)")
    saved = page.evaluate("(() => { const d = __q2.Save.read('1'); return {v: d.v, name: d.name, gold: d.gold, chapter: d.chapter}; })()")
    check("セーブできる（スロット1）", saved["gold"] == 4321 and saved["name"] == "テスト", saved)
    page.reload(wait_until="load"); page.wait_for_timeout(3500)
    check("再読込でタイトルに戻る", page.evaluate("__q2.state") == "title")
    page.evaluate("localStorage.setItem('" + ("areq3_save_" if game == "game3" else "areq2_save_") + "2', '{broken')")
    page.evaluate("void __q2.continueGame()")
    page.wait_for_timeout(600)
    # つづきから のメニューが出る → スロット1を選ぶ（メニューは1つ目が「オートセーブ」かもしれない）
    menu = page.evaluate("[...document.querySelectorAll('#menuList button, .menu button, #dlg button, button')].filter(e=>e.offsetParent).map(e=>e.innerText.trim().replace(/\\s+/g,' ').slice(0,30))")
    print("   つづきから候補:", menu[:8])
    browser.close()
print("合計", len(res), "失敗", res.count(False))
errs = [l for l in logs if l[0] in ("error", "pageerror") and "Failed to load" not in l[1]]
print("画面エラー:", errs[:4])
if srv: srv.terminate()
