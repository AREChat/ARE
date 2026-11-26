import sys, os, re, io
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
os.environ["ARE_SRC"] = "/tmp/g8site"
os.environ["ARE_SW"] = "block"
from h import *
from PIL import Image, ImageDraw
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:300]) if note else ""))
SRC = "/home/claude/r3/game/game8"
DST = "/tmp/g8site/game8"
def sync_code():
    import shutil
    for f in ("index.html", "style.css"): shutil.copy(f"{SRC}/{f}", f"{DST}/{f}")
    for f in os.listdir(f"{SRC}/js"): shutil.copy(f"{SRC}/js/{f}", f"{DST}/js/{f}")
sync_code()
IMG = DST + "/img"
def clear_img():
    for f in os.listdir(IMG):
        if f.endswith(".webp"): os.remove(f"{IMG}/{f}")
def make_imgs():
    def save(name, size, fn):
        im = Image.new("RGB", size); d = ImageDraw.Draw(im); fn(d, size); im.save(f"{IMG}/{name}.webp", "WEBP", quality=90)
    save("title", (1536, 1024), lambda d, s: d.rectangle([0, 0, *s], fill=(200, 40, 200)))                         # 紫
    save("card_race", (1200, 750), lambda d, s: d.rectangle([0, 0, *s], fill=(240, 150, 20)))                     # オレンジ
    save("card_action", (1200, 750), lambda d, s: d.rectangle([0, 0, *s], fill=(20, 200, 90)))                    # 緑
    save("result", (1536, 1024), lambda d, s: d.rectangle([0, 0, *s], fill=(230, 220, 30)))                       # 黄
    def sky(d, s, col):
        d.rectangle([0, 0, *s], fill=col)
        d.rectangle([int(s[0] * 0.30), 0, int(s[0] * 0.34), s[1]], fill=(255, 0, 0))                                 # 赤い縦の目印
    save("sky_race", (1536, 1024), lambda d, s: sky(d, s, (250, 60, 60)))
    import colorsys
    def rainbow(d, s):
        for x in range(s[0]):
            r, g, b = colorsys.hsv_to_rgb(x / s[0], 0.8, 0.95); d.line([(x, 0), (x, s[1])], fill=(int(r * 255), int(g * 255), int(b * 255)))
    save("sky_action", (1536, 1024), lambda d, s: rainbow(d, s))
    save("icon", (512, 512), lambda d, s: d.rectangle([0, 0, *s], fill=(10, 10, 10)))
def run_mode(page, btn, frames=1500):
    page.click(btn); page.wait_for_timeout(frames)
def close(c, a, tol=40): return all(abs(x - y) <= tol for x, y in zip(c, a))
def px(page, x, y):
    png = page.screenshot(); im = Image.open(io.BytesIO(png)).convert("RGB"); return im.getpixel((x, y))
with sync_playwright() as p:
    # ---- A: 絵が1枚も無い（いまの状態）：いままでどおり動く ----
    clear_img()
    browser, ctx, page, logs = new_page(p, width=900, height=600, touch=False)
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(BASE + "/game8/index.html"); page.wait_for_function("document.getElementById('bRace') && !document.getElementById('bRace').disabled", timeout=30000)
    check("A1 絵が無くても起動して、ボタンが押せる", True)
    check("A2 絵が無いとき、画面の絵のクラスは付かない", page.evaluate("![...document.body.classList].some(c => c.startsWith('art-'))"))
    run_mode(page, "#bRace"); check("A3 レースが始まる（絵なし）", page.evaluate("document.getElementById('s-play').classList.contains('on')"))
    page.screenshot(path="/tmp/g8_race_noart.png")
    browser.close()
    browser, ctx, page, logs = new_page(p, width=900, height=600, touch=False)
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(BASE + "/game8/index.html"); page.wait_for_function("!document.getElementById('bAction').disabled", timeout=30000)
    run_mode(page, "#bAction"); check("A4 アクションが始まる（絵なし）", page.evaluate("document.getElementById('s-play').classList.contains('on')"))
    page.screenshot(path="/tmp/g8_action_noart.png")
    check("A5 絵なしで、ページのエラーが出ない", not errs, errs)
    browser.close()
    # ---- B: 絵がある ----
    make_imgs(); errs.clear()
    browser, ctx, page, logs = new_page(p, width=900, height=600, touch=False)
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(BASE + "/game8/index.html"); page.wait_for_function("!document.getElementById('bRace').disabled", timeout=30000); page.wait_for_timeout(600)
    cls = page.evaluate("[...document.body.classList].filter(c => c.startsWith('art-')).sort()")
    check("B1 絵があると、画面の絵のクラスが付く", cls == ["art-card-action", "art-card-race", "art-result", "art-title"], cls)
    page.screenshot(path="/tmp/g8_title_art.png")
    bg = page.evaluate("getComputedStyle(document.getElementById('s-title')).backgroundImage")
    check("B2 タイトルの うしろに絵（title.webp）が敷かれる", "title.webp" in bg, bg[:200])
    c = px(page, 40, 560)   # 左下すみ（ボタンや文字がない）：紫＋暗いグラデ
    check("B3 タイトルの すみの色が 絵の紫に近い（暗くしてある）", c[0] > c[1] + 15 and c[2] > c[1] + 15, c)
    rr = page.evaluate("(() => { const a = document.getElementById('bRace').getBoundingClientRect(), b = document.getElementById('bAction').getBoundingClientRect(); return {w: a.width, h: a.height, bg: getComputedStyle(document.getElementById('bRace')).backgroundImage.includes('card_race'), bg2: getComputedStyle(document.getElementById('bAction')).backgroundImage.includes('card_action'), same: Math.abs(a.top - b.top) < 3}; })()")
    check("B4 モードのボタンが、絵のカードになる（横並び・16:10くらい）", rr["bg"] and rr["bg2"] and rr["same"] and 1.4 < rr["w"] / rr["h"] < 1.8, rr)
    page.evaluate("document.getElementById('bHow').click()"); page.wait_for_timeout(300)
    bg = page.evaluate("getComputedStyle(document.getElementById('s-how')).backgroundImage")
    check("B5 あそびかたの画面にも、同じ絵が敷かれる", "title.webp" in bg, bg[:120])
    page.evaluate("document.getElementById('howBack').click()"); page.wait_for_timeout(200)
    ic = page.evaluate("(document.querySelector('link[rel=icon]') || {}).href || ''")
    check("B6 icon.webp が、タブの絵になる", "icon.webp" in ic, ic)
    # レース：空の絵（オレンジ赤）が見える
    page.evaluate("document.getElementById('bRace').click()"); page.wait_for_timeout(2500)
    page.screenshot(path="/tmp/g8_race_art.png")
    top = [px(page, x, 40) for x in (150, 450, 750)]
    check("B7 レース：空の高いところに 空の絵（赤み）が見える", any(c[0] > 180 and c[2] < 140 for c in top), top)
    page.evaluate("document.getElementById('pauseBtn').click()"); page.wait_for_timeout(200)
    page.evaluate("document.getElementById('pTitle').click()"); page.wait_for_timeout(500)
    # アクション：空の絵（青）が見え、走ると流れる
    page.evaluate("document.getElementById('bAction').click()"); page.wait_for_timeout(2000)
    page.screenshot(path="/tmp/g8_action_art0.png")
    import colorsys as _cs
    def row(y):
        im = Image.open(io.BytesIO(page.screenshot())).convert("RGB"); return [_cs.rgb_to_hsv(*(v / 255 for v in im.getpixel((x, y))))[0] for x in range(0, 900, 6)]
    def hd(a, b): d = abs(a - b); return min(d, 1 - d)
    r0 = row(150)
    check("B8 アクション：空の高いところに 空の絵（にじ色）が見え、手作りの山は出ない", len({round(h, 1) for h in r0}) >= 3, [round(h, 2) for h in r0[::15]])
    page.keyboard.down("ArrowRight"); page.wait_for_timeout(2500); page.keyboard.up("ArrowRight")
    page.screenshot(path="/tmp/g8_action_art1.png")
    r1 = row(150)
    def best_shift(a, b):   # b[i] が a[i+k] に いちばん近い k
        best = None
        for k in range(-40, 41):
            tot = n = 0
            for i in range(len(b)):
                j = i + k
                if 0 <= j < len(a): tot += hd(b[i], a[j]); n += 1
            v = tot / max(1, n)
            if best is None or v < best[0]: best = (v, k)
        return best
    v, k = best_shift(r0, r1)
    check("B9 アクション：右へ走ると、空の絵が 左へ流れる（パララックス）", k > 0 and v < 0.05, (k, round(v, 3)))
    check("B10 絵ありで、ページのエラーが出ない", not errs, errs)
    browser.close()
    # ---- C: 絵がこわれている（中身が画像でない）：エラーにならず、いつもどおり ----
    clear_img()
    for n in ("title", "sky_race", "sky_action", "card_race"):
        open(f"{IMG}/{n}.webp", "wb").write(b"not an image")
    errs.clear()
    browser, ctx, page, logs = new_page(p, width=900, height=600, touch=False)
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(BASE + "/game8/index.html"); page.wait_for_function("!document.getElementById('bRace').disabled", timeout=30000)
    check("C1 こわれた絵は、無いものとして あつかう（クラスなし・ボタンは ふつう）", page.evaluate("![...document.body.classList].some(c => c.startsWith('art-'))"))
    page.evaluate("document.getElementById('bRace').click()"); page.wait_for_timeout(1500)
    check("C2 こわれた絵でも、レースが始まる・エラーなし", page.evaluate("document.getElementById('s-play').classList.contains('on')") and not errs, errs)
    browser.close()
clear_img()
print("%d/%d 通過" % (sum(res), len(res)))
sys.exit(0 if all(res) else 1)
