import sys, re, os, json
from urllib.parse import quote
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
HOST = "https://kzrrnuzzvwijujhlbtln.supabase.co"
def sign(path): return f"{HOST}/storage/v1/object/sign/chat-attachments/{path}?token=t"
VAR = ["v_backslash", "v_case", "v_nolist", "v_abs", "v_stored", "v_bom"]
FILES = {("r1/u/%s.pptx" % v): open("/tmp/ppv/%s.pptx" % v, "rb").read() for v in VAR}
FILES["r1/u/lo.pptx"] = open("/tmp/ppv/lo2/test.pptx", "rb").read()
FILES["r1/u/base.pptx"] = open("/tmp/pp/test.pptx", "rb").read()
def storage_route(route):
    m = re.search(r"/storage/v1/object/(?:sign|public)/chat-attachments/([^?]+)", route.request.url)
    if m and m.group(1) in FILES:
        return route.fulfill(status=200, headers={"access-control-allow-origin": "*"}, content_type="application/octet-stream", body=FILES[m.group(1)])
    return route.fulfill(status=404, headers={"access-control-allow-origin": "*"}, content_type="application/json", body=b"{}")
NOSTREAM = "delete window.DecompressionStream;"
ok_all = True
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=1000, height=800, touch=False)
    ctx.route(re.compile(r".*supabase\.co/storage/.*"), storage_route)
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    def run(label, name, init=None):
        global ok_all
        page.goto("about:blank")
        errs.clear()
        page.goto(BASE + "/fileview.html#u=" + quote(sign("r1/u/%s.pptx" % name), safe="") + "&n=" + quote(name + ".pptx", safe=""))
        page.wait_for_timeout(2600)
        n = page.locator(".pp-item").count(); txt = page.inner_text("#fvMain")
        good = n == 6 and "すれ違いタウン 発表会" in txt
        ok_all &= good
        print(("OK  " if good else "NG  ") + label, "| slides:", n, "|", ("" if good else txt[:70].replace("\n", " ")), errs[:1])
    for v in ["base"] + VAR + ["lo"]:
        run(v, v)
    # DecompressionStream が無いブラウザ（昔の Safari など）
    page.add_init_script(NOSTREAM)
    for v in ["base", "v_backslash", "v_stored", "lo"]:
        run("[展開機能なし] " + v, v)
    browser.close()
print("ALL_OK" if ok_all else "SOME_NG")
