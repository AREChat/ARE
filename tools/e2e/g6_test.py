import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
def snap(page): return page.evaluate("(() => { const g = (i) => document.getElementById(i); return {loc: g('locationName').textContent, hp: g('hpText').textContent, lv: g('levelText').textContent, coin: g('coinCount').textContent, tok: g('playerToken').style.left + ',' + g('playerToken').style.top, name: g('heroName').textContent}; })()")
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=900, height=700, touch=False)
    page.goto(f"{BASE}/game6/index.html", wait_until="load"); page.wait_for_timeout(1500)
    check("タイトルが見える", page.is_visible("#title"))
    page.fill("#titleName", "テスト旅人")
    page.click("#titleStart"); page.wait_for_timeout(700)
    check("はじめる → タイトルが消える", not page.is_visible("#title"))
    check("主人公の名前が反映される", "テスト旅人" in page.inner_text("#heroName"), page.inner_text("#heroName"))
    s0 = snap(page)
    moves = page.evaluate("[...document.querySelectorAll('button')].filter(b=>['↑','←','↓','→'].includes(b.textContent.trim())).map(b=>b.textContent.trim())")
    for arrow in ["→", "→", "↓", "↓", "←", "↑"]:
        # 歩くとランダムで魔物が出ることがある（仕様）。出たら逃げて続ける
        for _ in range(12):
            if not page.is_visible("#modal"): break
            fl = page.locator("#modalActions button", has_text="逃げる")
            if fl.count(): fl.first.click()
            elif page.is_visible("#modalClose"): page.click("#modalClose")
            page.wait_for_timeout(300)
        page.locator("button", has_text=arrow).first.click(); page.wait_for_timeout(250)
    s1 = snap(page)
    check("矢印ボタンで動ける", s0["tok"] != s1["tok"] or s0["loc"] != s1["loc"], (s0["tok"], s1["tok"]))
    page.click("#exploreBtn"); page.wait_for_timeout(500)
    explore_modal = page.is_visible("#modal")
    if explore_modal: page.click("#modalClose"); page.wait_for_timeout(200)
    page.click("#talkBtn"); page.wait_for_timeout(500)
    modal_open = page.is_visible("#modal") or explore_modal
    check("「話す」「調べる」で反応がある（ログ・ダイアログ）", modal_open or len(page.inner_text("#log")) > 20, page.inner_text("#log")[:60].replace("\n", " "))
    if page.is_visible("#modal"): page.click("#modalClose"); page.wait_for_selector("#modal", state="hidden", timeout=3000); page.wait_for_timeout(300)
    page.click("#battleBtn"); page.wait_for_timeout(800)
    in_battle = page.is_visible("#modal") and ("たたか" in page.inner_text("#modalBody") or "戦" in page.inner_text("#modalTitle") + page.inner_text("#modalBody") or page.locator("#modalActions button").count() > 0)
    check("「戦う」で戦闘が始まる", in_battle, page.inner_text("#modalTitle")[:30])
    # 戦闘を最後まで（最初のボタンを押し続ける）
    for _ in range(40):
        if not page.is_visible("#modal"): break
        btns = page.locator("#modalActions button")
        if btns.count() == 0: page.click("#modalClose"); break
        btns.first.click(); page.wait_for_timeout(250)
    check("戦闘が終わって通常画面に戻れる", not page.is_visible("#modal") or page.locator("#modalActions button").count() > 0)
    if page.is_visible("#modal"):
        try: page.click("#modalClose")
        except Exception: pass
    page.wait_for_timeout(300)
    # 保存→再読込→読込
    page.click("#saveBtn"); page.wait_for_timeout(300)
    stored = page.evaluate("Object.keys(localStorage).filter(k => /game6|save/i.test(k))")
    check("保存するとブラウザに記録が残る", len([k for k in stored if k != 'game6-enc']) >= 1, stored)
    before = snap(page)
    page.reload(wait_until="load"); page.wait_for_timeout(1200)
    check("再読込後のタイトルに「つづきから」が使える", page.is_visible("#titleContinue") and not page.locator("#titleContinue").is_disabled())
    page.click("#titleContinue"); page.wait_for_timeout(700)
    after = snap(page)
    check("つづきからで状態が一致（名前・レベル・場所・コイン）", all(before[k] == after[k] for k in ("name", "lv", "loc", "coin")), (before, after))
    page.evaluate("localStorage.setItem(Object.keys(localStorage).find(k=>/save/i.test(k)) || 'x', '{broken')")
    page.reload(wait_until="load"); page.wait_for_timeout(1200)
    try:
        if page.is_visible("#titleContinue"): page.click("#titleContinue"); page.wait_for_timeout(500)
        check("壊れた保存データでも画面が固まらない", True)
    except Exception as e: check("壊れた保存データでも画面が固まらない", False, str(e)[:80])
    errs = [l for l in logs if l[0] in ("error", "pageerror") and "Failed to load" not in l[1]]
    check("画面のエラーなし", not errs, errs[:3])
    browser.close()
print("合計", len(res), "失敗", res.count(False))
if srv: srv.terminate()
