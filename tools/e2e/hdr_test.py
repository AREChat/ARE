import sys, os, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
EXTRA = open(HERE + "/chat_test.py", encoding="utf-8").read().split('EXTRA = """')[1].split('"""')[0]
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
JS_VIS = """() => { const vis = (e) => { if(!e) return false; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const ids = ['logoutButton','refreshRoomsButton','installAppButton','segHelpLink','userSearch','refreshUsersButton','postsRefresh','moreSearch','newGroupButton','addFriendButton'];
  const o = {}; for(const i of ids) o[i] = vis(document.getElementById(i));
  const b = document.querySelector('.brand').getBoundingClientRect(); o._brand = [Math.round(b.width), Math.round(b.height)]; o._over = document.documentElement.scrollWidth > window.innerWidth + 1;
  const br = document.querySelector('.brand').getBoundingClientRect(), h1 = document.querySelector('.brand h1').getBoundingClientRect();
  let fit = true; for(const e of document.querySelectorAll('.brand-actions button, .brand-actions input, .brand-actions a')){ const r = e.getBoundingClientRect(); if(r.width === 0) continue; if(r.left < h1.right - 1 || r.right > br.right + 1 || r.bottom > br.bottom + 1) fit = false; }
  o._actions_fit = fit; return o; }"""
EXPECT = {
 "chats": {"segHelpLink": True, "refreshRoomsButton": True, "installAppButton": False, "logoutButton": False, "userSearch": False, "postsRefresh": False, "moreSearch": False, "newGroupButton": True, "addFriendButton": True},
 "users": {"userSearch": True, "refreshUsersButton": True, "logoutButton": False, "segHelpLink": False, "refreshRoomsButton": False, "installAppButton": False},
 "posts": {"postsRefresh": True, "logoutButton": False, "userSearch": False, "refreshUsersButton": False},
 "more":  {"moreSearch": True, "logoutButton": False, "postsRefresh": False, "segHelpLink": False},
 "me":    {"logoutButton": True, "segHelpLink": False, "refreshRoomsButton": False, "userSearch": False, "postsRefresh": False, "moreSearch": False},
}
W = int(sys.argv[1]) if len(sys.argv) > 1 else 411
H = int(sys.argv[2]) if len(sys.argv) > 2 else 860
touch = W < 700
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=W, height=H, extra_fx=EXTRA, touch=touch)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(6500)
    for tab in ["chats", "users", "posts", "more", "me"]:
        page.click(f".rail-btn[data-tab={tab}]"); page.wait_for_timeout(500)
        v = page.evaluate(JS_VIS)
        bad = {k: (v[k], want) for k, want in EXPECT[tab].items() if v[k] != want}
        check(f"[{W}px] {tab}タブ：ボタンの出し分け", not bad, bad or "")
        check(f"[{W}px] {tab}タブ：上のバーが はみ出さない", v["_actions_fit"] and not v["_over"], v["_brand"])
        page.screenshot(path=f"/tmp/shots/hdr_{W}_{tab}.png")
    # 動き：更新ボタン・検索・操作方法
    page.click(".rail-btn[data-tab=users]"); page.wait_for_timeout(300)
    page.fill("#userSearch", "みど"); page.wait_for_timeout(700)
    n = page.evaluate("document.querySelectorAll('#recommendedUsers [data-user-id]').length")
    check("ユーザー検索（上のバーの入力欄）で 一覧がしぼられる", n >= 1, n)
    page.click("#refreshUsersButton"); page.wait_for_timeout(500)
    page.click(".rail-btn[data-tab=more]"); page.wait_for_timeout(300)
    page.fill("#moreSearch", "天気"); page.wait_for_timeout(500)
    shown = page.evaluate("[...document.querySelectorAll('.pane-more .more-item')].filter(e => getComputedStyle(e).display !== 'none').length")
    total = page.evaluate("document.querySelectorAll('.pane-more .more-item').length")
    check("機能を検索（上のバーの入力欄）で 項目がしぼられる", 0 < shown < total, f"{shown}/{total}")
    page.fill("#moreSearch", "")
    page.click(".rail-btn[data-tab=chats]"); page.wait_for_timeout(300)
    href = page.evaluate("document.getElementById('segHelpLink').getAttribute('href')")
    check("マニュアル → help.html", href == "./help.html", href)
    # アプリ追加
    page.click(".rail-btn[data-tab=more]"); page.wait_for_timeout(300); page.click("#installAppItem"); page.wait_for_timeout(500)
    sheet = page.evaluate("(() => { const m = document.getElementById('profileModal'); const s = document.getElementById('hdrInstallSheet'); return {open: !!m && !m.hidden, text: s ? s.innerText.slice(0, 80) : ''}; })()")
    check("📲：合図が無いときは 手順の案内が開く", sheet["open"] and "追加" in sheet["text"], sheet["text"].replace("\n", " "))
    page.screenshot(path=f"/tmp/shots/hdr_{W}_install.png")
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    # 合図があるとき：prompt が呼ばれる
    page.evaluate("() => { document.getElementById('profileModal').hidden = true; window.__called = 0; window.__areInstallEvent = {prompt(){ window.__called++; }, userChoice: Promise.resolve({outcome:'accepted'})}; }")
    page.click(".rail-btn[data-tab=more]"); page.wait_for_timeout(300); page.click("#installAppItem"); page.wait_for_timeout(500)
    called = page.evaluate("window.__called")
    check("📲：合図があれば ワンクリックでインストール画面（prompt）", called == 1, called)
    errs = [l for l in logs if l[0] in ("error", "pageerror") and "supabase" not in l[1].lower() and "Failed to load resource" not in l[1]]
    check("コンソールにエラーが出ない", not errs, errs[:3])
    browser.close()
print("結果:", sum(res), "/", len(res))
