import sys, glob
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
pages = sorted(os.path.relpath(f, SRC) for f in glob.glob(SRC + "/**/*.html", recursive=True))
JS = """
(() => {
  const out = {};
  const ev = (k, o) => new KeyboardEvent('keydown', Object.assign({key:k, bubbles:true, cancelable:true}, o||{}));
  const tgt = document.body || document.documentElement;
  out.f12 = !tgt.dispatchEvent(ev('F12'));
  out.ctrlshifti = !tgt.dispatchEvent(ev('I', {ctrlKey:true, shiftKey:true}));
  out.ctrlu = !tgt.dispatchEvent(ev('u', {ctrlKey:true}));
  out.ctx = !tgt.dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, cancelable:true, button:2}));
  const c = document.querySelector('canvas'); if (c) out.ctxCanvas = !c.dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, cancelable:true, button:2}));
  return out;
})()
"""
bad = 0
only = sys.argv[1:]
with sync_playwright() as p:
    for rel in pages:
        if only and rel not in only: continue
        browser, ctx, page, logs = new_page(p, width=1000, height=800, touch=False)
        try:
            page.goto(BASE + "/" + rel, wait_until="load", timeout=25000)
            page.wait_for_timeout(1200)
            r = page.evaluate(JS)
        except Exception as e:
            r = {"error": str(e)[:100]}
        ok = r.get("f12") and r.get("ctx") and r.get("ctrlshifti") and r.get("ctrlu") and r.get("ctxCanvas", True)
        if not ok: bad += 1
        moved = page.url.replace(BASE, "")
        print(("OK  " if ok else "NG  ") + rel.ljust(26) + (" → " + moved if moved.strip("/") != rel else "") + "  " + str(r))
        browser.close()
print("ページ数", len(pages), "ブロックできていない", bad)
if srv: srv.terminate()
