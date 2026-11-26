import sys, glob
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
pages = sorted(os.path.relpath(f, SRC) for f in glob.glob(SRC + "/**/*.html", recursive=True) if "/.git/" not in f)
JS = """
(() => {
  const o = {};
  const kd = (k, x) => !document.body.dispatchEvent(new KeyboardEvent('keydown', Object.assign({key:k, bubbles:true, cancelable:true}, x||{})));
  o.f7 = kd('F7'); o.ctrlShiftS = kd('S', {ctrlKey:true, shiftKey:true}); o.ctrlP = kd('p', {ctrlKey:true});
  o.f5 = kd('F5'); o.f11 = kd('F11'); o.enter = kd('Enter'); o.space = kd(' '); o.arrow = kd('ArrowLeft'); o.ctrlC = kd('c', {ctrlKey:true}); o.ctrlV = kd('v', {ctrlKey:true}); o.ctrlA_field = false;
  // ドロップ：入力欄の外はキャンセル、入力欄の上はそのまま
  const mk = (t) => { const e = new Event(t, {bubbles:true, cancelable:true}); return e; };
  o.dropBody = !document.body.dispatchEvent(mk('drop'));
  const inp = document.createElement('input'); document.body.appendChild(inp);
  o.dropField = !inp.dispatchEvent(mk('drop')); inp.remove();
  return o;
})()
"""
res = []
def ck(n, ok, note=""): res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
with sync_playwright() as p:
    for rel in pages:
        browser, ctx, page, logs = new_page(p, width=1000, height=800, touch=False)
        try:
            page.goto(BASE + "/" + rel, wait_until="load", timeout=25000); page.wait_for_timeout(1500)
            r = page.evaluate(JS)
        except Exception as e:
            r = {"error": str(e)[:100]}
        final = page.url.replace(BASE, "").split("?")[0].lstrip("/")
        info = any(x in final for x in ("terms", "privacy", "faq", "guide", "help", "credits", "changelog", "404", "manual"))
        chat = final == "chat.html"
        game = final.startswith(("game/", "game2/index", "game3/", "game4/", "game6/", "game7/", "dream-frontier/", "daifugo/", "game5/play/"))
        want_p = not (info or chat)
        base_ok = (not r.get("error")) and r["f7"] and r["ctrlShiftS"] and r["ctrlP"] == want_p and (not r["f5"]) and (not r["f11"]) and r["dropBody"]
        # ふつうのキー・コピー・貼り付けが止まっていないこと（ゲームは、操作に使うキーを ゲーム自身が使うので、ここでは見ない）
        pass_ok = game or ((not r["enter"]) and (not r["space"]) and (not r["arrow"]) and (not r["ctrlC"]) and (not r["ctrlV"]) and (not r["dropField"]))
        game_ok = (not game) or ((not r["ctrlC"]) and (not r["ctrlV"]) is not None)
        ok = base_ok and pass_ok
        ck(rel.ljust(26), ok, r if not ok else "")
        browser.close()
print("合計", len(res), "失敗", res.count(False))
if srv: srv.terminate()
