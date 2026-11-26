import sys, os, subprocess, time, urllib.request
from playwright.sync_api import sync_playwright
SRC = "/home/claude/r3/game"; PORT = int(os.environ.get("ARE_PORT", "8972"))
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1", "--directory", SRC], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(40):
    time.sleep(.2)
    try: urllib.request.urlopen(f"http://127.0.0.1:{PORT}/index.html", timeout=2); break
    except Exception: pass
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
CASES = [("game/index.html", "#btnQuit", False), ("game6/index.html", "#btnExit", True), ("game7/index.html", "#exitBtn", True)]
with sync_playwright() as p:
    b = p.chromium.launch(args=["--host-resolver-rules=MAP web.test 127.0.0.1"])
    for mode, host, q in [("Web", "web.test", ""), ("exe", "127.0.0.1", "")]:
        for u, sel, modal in CASES:
            ctx = b.new_context(viewport={"width": 1000, "height": 720}, service_workers="block")
            ctx.add_init_script("try{localStorage.setItem('are_gtips_off','1')}catch(e){}")
            seen = []
            def mk(seen):
              def handler(r, _req=None):
                  url = r.request.url
                  if ":" + str(PORT) in url: 
                      if "__quit" in url: seen.append("quit"); return r.fulfill(status=200, content_type="text/plain", body="bye")
                      return r.continue_()
                  seen.append(url); return r.fulfill(status=200, content_type="text/html", body="<html><body>外部</body></html>")
              return handler
            ctx.route("**/*", mk(seen))
            page = ctx.new_page(); page.on("dialog", lambda d: d.accept())
            page.goto(f"http://{host}:{PORT}/{u}{q}", wait_until="load", timeout=40000); page.wait_for_timeout(2200)
            lab = page.inner_text(sel).strip()
            want = "チャットへ" if mode == "Web" else "おわる"
            check(f"[{mode}] {u}：出口ボタンの文字（{want}）", want in lab, lab)
            page.click(sel, no_wait_after=True); page.wait_for_timeout(900)
            if modal:
                m = page.evaluate("document.body.innerText")
                if mode == "Web":
                    check(f"[{mode}] {u}：確認に「チャットにもどる」がある", "チャットにもどる" in m)
                    page.get_by_text("💬 チャットにもどる").click(no_wait_after=True)
                else:
                    check(f"[{mode}] {u}：確認に「ゲームをおわる」と「ほかのゲームへ（一覧）」がある", "ゲームをおわる" in m and "ほかのゲームへ（一覧）" in m)
                    page.get_by_text("✖ ゲームをおわる").click(no_wait_after=True)
            if u.startswith("game/"):
                body = page.evaluate("document.body.innerText")
                want_q = "チャット画面に もどりますか" if mode == "Web" else "ゲームを おわりますか"
                check(f"[{mode}] {u}：確認の文「{want_q}」が出る", want_q in body, body[-90:].replace("\n", " "))
                page.get_by_role("button", name="はい").first.click(no_wait_after=True)
            page.wait_for_timeout(1500 if mode == "Web" else 3800)
            if mode == "Web":
                check(f"[{mode}] {u}：チャット（ログイン画面）へ移る", any("arechat.github.io/ARE/" in s for s in seen) or "arechat.github.io" in page.url, (seen[:2], page.url[:60]))
            else:
                ok = "quit" in seen or page.url.rstrip("/").endswith("/index.html") or "おつかれ" in page.evaluate("document.body.innerText")
                check(f"[{mode}] {u}：アプリを終了する要求を出す／できなければ一覧へ", ok, (seen[:2], page.url[-40:]))
                check(f"[{mode}] {u}：チャット（外のアドレス）へは飛ばない", not any("arechat.github.io" in s for s in seen) and "arechat.github.io" not in page.url)
            ctx.close()
    b.close()
srv.terminate()
print("合計", len(res), "失敗", res.count(False))
