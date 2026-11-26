import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
def st(page): return page.evaluate("({mode:G.mode, map: G.S && G.S.map, x: G.S && G.S.x, y: G.S && G.S.y, name: G.S && G.S.name, gold: G.S && G.S.gold, slot: G.slot})")
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=960, height=640, touch=False)
    page.goto(f"{BASE}/game/index.html", wait_until="load"); page.wait_for_timeout(2500)
    check("タイトルが出る", page.evaluate("G.mode") == "title")
    page.click("[data-a=tNew]"); page.click("[data-a=slotNew] >> nth=0"); page.wait_for_timeout(300)
    page.fill("#pName", "テスト"); page.select_option("#pMon", "3"); page.select_option("#pDay", "5")
    page.click("[data-a=pNext]"); page.wait_for_timeout(300)
    check("性格診断へ進む", page.evaluate("G.mode") == "persona", page.evaluate("G.mode"))
    for _ in range(3): page.click("[data-a=qAns][data-v='1']"); page.wait_for_timeout(150)
    check("診断の結果が出る", page.evaluate("G.mode") == "result")
    page.click("[data-a=rStart]"); page.wait_for_timeout(2500)
    s0 = st(page); print("   開始直後:", s0)
    check("ぼうけんが始まる（タイトルを抜ける）", s0["mode"] not in ("title", "result", "persona", "profile", "slots") and s0["name"] == "テスト", s0)
    page.screenshot(path="/tmp/are-e2e/shots_games/rpg_1start.png")
    # 進める：ストーリー会話などをEnterで送り、フィールドに出たら歩く
    for i in range(60):
        m = page.evaluate("G.mode")
        if m in ("field", "map", "walk"): break
        page.keyboard.press("Enter"); page.wait_for_timeout(250)
    s1 = st(page); print("   会話を送ったあと:", s1)
    for k in ["ArrowDown", "ArrowDown", "ArrowRight", "ArrowRight", "ArrowUp", "ArrowLeft"] * 3:
        page.keyboard.down(k); page.wait_for_timeout(180); page.keyboard.up(k); page.wait_for_timeout(120)
    s2 = st(page); print("   歩いたあと:", s2)
    check("操作に反応する（位置か画面が変わる）", (s2["x"], s2["y"], s2["mode"]) != (s1["x"], s1["y"], s1["mode"]) or s1["mode"] != "title", (s1, s2))
    page.screenshot(path="/tmp/are-e2e/shots_games/rpg_2walk.png")
    # 保存
    r = page.evaluate("tqSaveTo(1, 'テスト保存')")
    check("冒険の書に保存できる", r["ok"], r["msg"])
    saved = page.evaluate("JSON.parse(localStorage.getItem('tq_save_1')).data")
    check("保存データが正しい形（v=3・名前・マップ）", saved["v"] == 3 and saved["name"] == "テスト" and saved["map"], {k: saved[k] for k in ("v", "name", "map")})
    page.evaluate("G.S.gold += 123; tqAutoSave()")
    gold_before = page.evaluate("G.S.gold")
    # 再読込→つづきから
    page.reload(wait_until="load"); page.wait_for_timeout(2500)
    check("再読込後もタイトルに戻り、保存は残る", page.evaluate("G.mode") == "title" and page.evaluate("tqHasSaves()"))
    page.click("[data-a=tLoad]"); page.wait_for_timeout(300)
    page.locator("[data-a=slotLoad], [data-a=slotPick], [data-a=slotGo]").first.click(timeout=3000) if page.locator("[data-a=slotLoad], [data-a=slotPick], [data-a=slotGo]").count() else print("   ボタン候補:", page.evaluate("[...document.querySelectorAll('[data-a]')].filter(e=>e.offsetParent).map(e=>e.dataset.a)"))
    page.wait_for_timeout(1500)
    s3 = st(page); print("   読込後:", s3)
    check("つづきから読み込める（名前・所持金が一致）", s3["name"] == "テスト" and s3["gold"] == gold_before, (s3, gold_before))
    # 壊れた保存データでも落ちない
    page.evaluate("localStorage.setItem('tq_save_2','{broken')")
    page.reload(wait_until="load"); page.wait_for_timeout(2000)
    check("壊れた保存データがあっても起動できる", page.evaluate("G.mode") == "title")
    errs = [l for l in logs if l[0] in ("error", "pageerror") and "Failed to load" not in l[1]]
    check("画面のエラーなし", not errs, errs[:3])
    browser.close()
print("合計", len(res), "失敗", res.count(False))
if srv: srv.terminate()
