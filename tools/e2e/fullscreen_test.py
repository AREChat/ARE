import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=900, height=700, touch=False)
    page.goto(BASE + "/chat.html"); page.wait_for_timeout(3500)
    page.evaluate("document.getElementById('hdrForce') && document.getElementById('hdrForce').remove()")
    check("ページに「翻訳しない」の指定がある", page.evaluate("document.documentElement.getAttribute('translate')==='no' && !!document.querySelector('meta[name=google][content=notranslate]')"))
    check("全画面ツールが一覧にある", page.evaluate("TOOL_LIST.some(t=>t[0]==='fullscreen') && typeof openFullscreenTool==='function'"))
    page.evaluate("document.querySelector('[data-tool=fullscreen]') && 0")
    page.evaluate("openFullscreenTool()"); page.wait_for_timeout(600)
    on = page.evaluate("!!document.fullscreenElement")
    toast = page.evaluate("(document.getElementById('toast')||{}).textContent||''")
    check("全画面になる（またはブラウザの都合で断られたら、お知らせが出る）", on or "全画面" in toast, toast[:60])
    if on:
        page.evaluate("openFullscreenTool()"); page.wait_for_timeout(400)
        check("もう一度押すと、全画面をやめる", not page.evaluate("!!document.fullscreenElement"))
    # ---- 初期設定でオン：最初の操作で、自動で全画面になる ----
    def fs(pg):
        try: return pg.evaluate("!!document.fullscreenElement")
        except Exception: return None
    page.evaluate("try{localStorage.removeItem('are_fs_off');sessionStorage.removeItem('are_fs_left')}catch(e){}")
    page.goto(BASE + "/chat.html"); page.wait_for_timeout(3000)
    check("開いただけでは、まだ全画面にならない（ブラウザの決まりで、操作が必要）", fs(page) is False)
    page.mouse.click(5, 5); page.wait_for_timeout(700)
    check("最初のクリックで、自動で全画面になる（初期設定オン）", fs(page) is True)
    page.evaluate("openFullscreenTool()"); page.wait_for_timeout(500)
    page.wait_for_timeout(500); check("ツールで やめると、設定がオフになり、全画面をやめる", fs(page) is False and page.evaluate("localStorage.getItem(\"are_fs_off\")===\"1\""), (fs(page), page.evaluate("localStorage.getItem(\"are_fs_off\")")))
    page.goto(BASE + "/chat.html"); page.wait_for_timeout(3000)
    page.mouse.click(5, 5); page.wait_for_timeout(700)
    check("オフにしたあとは、次に開いても、自動では全画面にならない", fs(page) is False)
    page.evaluate("openFullscreenTool()"); page.wait_for_timeout(600)
    check("もう一度ツールを押すと、また全画面になり、設定もオンに戻る", fs(page) is True and page.evaluate("localStorage.getItem('are_fs_off')===null"))
    page.evaluate("document.exitFullscreen()"); page.wait_for_timeout(500)   # Esc でやめたのと同じ
    page.mouse.click(5, 5); page.wait_for_timeout(600)
    check("Esc でやめたあとは、そのタブでは、勝手に入りなおさない", fs(page) is False and page.evaluate("sessionStorage.getItem('are_fs_left')==='1'"))
    page.evaluate("openFullscreenTool()"); page.wait_for_timeout(600)
    check("そのあと ツールを押せば、また入れる", fs(page) is True)
    # ---- ほかのページ（ログイン）でも、同じく 初期オン／ゲーム画面は対象外 ----
    page.evaluate("try{localStorage.removeItem('are_fs_off');sessionStorage.removeItem('are_fs_left')}catch(e){}")
    page.goto(BASE + "/login.html"); page.wait_for_timeout(2500)
    page.mouse.click(5, 5); page.wait_for_timeout(700)
    check("ログイン画面でも、最初の操作で 全画面になる", fs(page) is True)
    check("「ホーム画面に追加」用の設定が、主なページに入っている", all(open(os.path.join(os.environ.get('ARE_SRC','/home/claude/are'), f), encoding='utf8').read().count('apple-mobile-web-app-capable') for f in ['index.html','login.html','register.html','chat.html','help.html']))
    check("アプリとして開いたときは、全画面で始まる設定になっている", '"fullscreen"' in open(os.path.join(os.environ.get('ARE_SRC','/home/claude/are'), 'manifest.webmanifest'), encoding='utf8').read())
    check("エラーなし", not [l for l in logs if l[0] == "pageerror"], [l for l in logs if l[0] == "pageerror"][:2])
print(sum(res), "/", len(res))
