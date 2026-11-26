import sys, zlib, base64, hashlib, os, random, re
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
random.seed(7)
ja = ("日本語のテスト文章です。すれ違いタウンでスライドを表示します。\n" * 3000).encode()
cases = {"empty": b"", "one": b"A", "rep1MB": b"abc" * 350000, "random200K": bytes(random.getrandbits(8) for _ in range(200000)),
         "ja": ja, "mixed": (os.urandom(5000) + b"hello " * 20000 + os.urandom(3000)), "allbytes": bytes(range(256)) * 400}
def raw(data, level, strat=zlib.Z_DEFAULT_STRATEGY):
    c = zlib.compressobj(level, zlib.DEFLATED, -15, 9, strat); return c.compress(data) + c.flush()
tests = []
for name, d in cases.items():
    for level in (0, 1, 6, 9):
        tests.append((f"{name}/L{level}", raw(d, level), d))
    tests.append((f"{name}/fixed", raw(d, 6, zlib.Z_FIXED), d))
    tests.append((f"{name}/huffonly", raw(d, 6, zlib.Z_HUFFMAN_ONLY), d))
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=800, height=600, touch=False)
    page.goto(BASE + "/fileview.html"); page.wait_for_timeout(500)
    page.add_script_tag(url=BASE + "/fileview-pptx.js"); page.wait_for_timeout(300)
    bad = 0
    for name, comp, d in tests:
        r = page.evaluate("""async ([b64, n]) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
            try { const out = AREPptx._inflate(u, 64*1024*1024); const h = await crypto.subtle.digest('SHA-256', out); return [out.length, [...new Uint8Array(h)].map(x => x.toString(16).padStart(2,'0')).join('')]; } catch (e) { return ['ERR', String(e.message)]; } }""", [base64.b64encode(comp).decode(), name])
        want = (len(d), hashlib.sha256(d).hexdigest())
        ok = r[0] == want[0] and r[1] == want[1]
        if not ok: bad += 1; print("NG ", name, r[:2], want[0])
    print(f"{len(tests) - bad}/{len(tests)} 一致")
    # 壊れたデータ・大きすぎるデータは、エラーで止まる（固まらない）
    r = page.evaluate("""() => { const res = []; for (const u of [new Uint8Array([0xff,0xff,0xff,0xff]), new Uint8Array([0x05,0x00]), new Uint8Array([])]) { try { AREPptx._inflate(u, 1000); res.push('no-error'); } catch (e) { res.push(e.message); } } 
        try { AREPptx._inflate(new Uint8Array(%s), 1000); res.push('no-error'); } catch (e) { res.push(e.message); } return res; }""" % list(raw(b"x" * 100000, 9)))
    print("壊れた・大きすぎる入力：", r)
    browser.close()
sys.exit(0 if bad == 0 else 1)
