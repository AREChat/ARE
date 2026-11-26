import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
JS = """
async () => {
  const ok = await AREFast.load('./are-fast.wasm');
  if (!ok) return {loaded: false};
  const cv = document.createElement('canvas'); cv.id = 'ieCanvas'; document.body.appendChild(cv);
  const src = document.createElement('canvas'); src.width = 120; src.height = 80;
  const sc = src.getContext('2d'), id = sc.createImageData(120, 80);
  for (let i = 0; i < id.data.length; i += 4) { id.data[i] = Math.random()*256; id.data[i+1] = Math.random()*256; id.data[i+2] = Math.random()*256; id.data[i+3] = 255; }
  sc.putImageData(id, 0, 0);
  const names = IE_FILTERS.map(f => f[0]), out = {loaded: true, cases: 0, bad: [], wasmCalls: 0};
  const realAdjust = AREFast.adjust, realReady = AREFast.ready;
  AREFast.adjust = function () { out.wasmCalls++; return realAdjust.apply(this, arguments); };
  for (const filter of names) for (const gray of [false, true]) for (const [bright, contrast] of [[0,0],[25,-30],[-60,70]]) {
    if (!gray && filter === 'none' && bright === 0 && contrast === 0) continue;
    feat.ie = {src, orig: src, rot: 0, flip: false, aspect: null, bright, contrast, gray, filter, text: '', tpos: 'bottom', tcolor: 'white', name: 't', crop: null, history: []};
    try { renderEdit(); } catch (e) {}
    const a = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data.slice();
    AREFast.ready = () => false;
    try { renderEdit(); } catch (e) {}
    AREFast.ready = realReady;
    const b = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    out.cases++;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { out.bad.push(filter + '/' + gray + '/' + bright + '/' + contrast); break; }
  }
  return out;
}
"""
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=900, height=700, touch=False)
    page.goto(BASE + "/chat.html"); page.wait_for_timeout(3500)
    r = page.evaluate(JS)
    check("ブラウザの中で、wasm が読みこめる（CSP でも止まらない）", r.get("loaded") is True, r)
    check("写真編集：C++ を使った結果と、元の JS の結果が、1画素も違わない（%s 通り）" % r.get("cases"), r.get("loaded") and not r["bad"] and r["cases"] > 40, r.get("bad"))
    check("写真編集：ほんとうに C++ が呼ばれている", (r.get("wasmCalls") or 0) >= r.get("cases", 1), r.get("wasmCalls"))
    check("エラーなし", not [l for l in logs if l[0] == "pageerror" or "wasm" in l[1].lower() or "Content Security" in l[1]], [l for l in logs if l[0] in ("pageerror",)][:2])
    browser.close()
print(sum(res), "/", len(res)); sys.exit(0 if all(res) else 1)
