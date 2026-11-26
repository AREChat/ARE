import sys, json, re
from urllib.parse import quote
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:240]) if note else ""))
HOST = "https://kzrrnuzzvwijujhlbtln.supabase.co"
def sign(path): return f"{HOST}/storage/v1/object/sign/chat-attachments/{path}?token=t"
FILES = {"r1/u/test.pptx": open("/tmp/pp/test.pptx", "rb").read(), "r1/u/bad.pptx": b"PK\x03\x04 this is not a real pptx", "r1/u/old.ppt": b"\xd0\xcf\x11\xe0 old"}
def storage_route(route):
    m = re.search(r"/storage/v1/object/(?:sign|public)/chat-attachments/([^?]+)", route.request.url)
    if m and m.group(1) in FILES:
        return route.fulfill(status=200, headers={"access-control-allow-origin": "*"}, content_type="application/octet-stream", body=FILES[m.group(1)])
    return route.fulfill(status=404, headers={"access-control-allow-origin": "*"}, content_type="application/json", body=b"{}")
def viewer(page, path, name=None, wait=2500):
    page.goto(BASE + "/fileview.html#u=" + quote(sign(path), safe="") + (("&n=" + quote(name, safe="")) if name else ""))
    page.wait_for_timeout(wait)
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=1000, height=800, touch=False)
    ctx.route(re.compile(r".*supabase\.co/storage/.*"), storage_route)
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    viewer(page, "r1/u/test.pptx", "発表会.pptx", wait=3500)
    check("pptx：6枚ぶんの枠が並ぶ", page.locator(".pp-item").count() == 6, page.locator(".pp-item").count())
    check("pptx：枚数が出る", "6 枚" in page.inner_text("#fvMeta"), page.inner_text("#fvMeta"))
    check("pptx：スライドショーのボタンが2つ出る", page.is_visible("#fvShow") and page.is_visible("#fvShowHere"))
    check("pptx：ダウンロードボタンも出る", page.is_visible("#fvSave"))
    check("pptx：ブラウザ標準の表示（iframe・embed・object）を使わない", not page.query_selector("embed,iframe,object"))
    txt = page.inner_text("#fvMain")
    check("1枚目：題名と副題が出る", "すれ違いタウン 発表会" in txt and "ARE チーム" in txt)
    check("2枚目：箇条書きが出る", "今日のながれ" in txt and "位置は ざっくりの区画だけ" in txt)
    check("3枚目：図形の文字・色つき文字が出る", "青い角丸の四角" in txt and "太字・下線・色つきの文字" in txt)
    check("3枚目：画像が1つ出る", page.locator(".pp-item:nth-child(3) img").count() == 1, page.locator(".pp-item:nth-child(3) img").count())
    check("3枚目：線が svg で出る", page.locator(".pp-item:nth-child(3) svg line").count() == 1)
    check("4枚目：表が出る（4行）", page.locator(".pp-item:nth-child(4) table tr").count() == 4 and "ポイント" in txt)
    page.evaluate("document.querySelectorAll('.pp-item')[4].scrollIntoView({block:'center'})"); page.wait_for_timeout(1200)
    check("5枚目：非表示の印が出る", "非表示のスライド" in page.inner_text(".pp-item:nth-child(5) .pp-bar"), page.inner_text(".pp-item:nth-child(5) .pp-bar"))
    check("発表者メモが出る", "最初のあいさつ" in page.inner_text(".pp-item:nth-child(1) .pp-notes"))
    # 色
    col = page.evaluate("""() => { const s=[...document.querySelectorAll('.pp-item:nth-child(3) .pp-s')].find(e=>e.textContent.includes('青い角丸')); return s ? getComputedStyle(s).backgroundColor : null }""")
    check("3枚目：図形の塗りの色（青）が合っている", col == "rgb(46, 117, 182)", col)
    page.screenshot(path="/tmp/pp/list.png")
    # 画像が壊れていない
    ok_img = page.evaluate("() => { const i=document.querySelector('.pp-item:nth-child(3) img'); return i && i.naturalWidth > 0 }")
    check("3枚目：画像がちゃんと読み込まれている", ok_img)
    # スライドショー（最初から）
    page.click("#fvShow")
    page.wait_for_timeout(1200)
    check("スライドショー：画面いっぱいの表示が開く", page.locator(".pp-show").count() == 1 and page.is_visible(".pp-show"))
    check("スライドショー：1 / 6 と出る", "1 / 6" in page.inner_text(".pp-count"), page.inner_text(".pp-count"))
    check("スライドショー：1枚目の文字が出る", "すれ違いタウン 発表会" in page.inner_text(".pp-showframe"))
    page.screenshot(path="/tmp/pp/show1.png")
    page.keyboard.press("ArrowRight"); page.wait_for_timeout(600)
    check("→ キーで 2枚目", "2 / 6" in page.inner_text(".pp-count") and "今日のながれ" in page.inner_text(".pp-showframe"), page.inner_text(".pp-count"))
    page.keyboard.press("ArrowLeft"); page.wait_for_timeout(600)
    check("← キーで 1枚目にもどる", "1 / 6" in page.inner_text(".pp-count"))
    page.keyboard.press("End"); page.wait_for_timeout(600)
    check("End で 最後（6枚目）", "6 / 6" in page.inner_text(".pp-count") and "ありがとうございました" in page.inner_text(".pp-showframe"))
    check("最後のスライドで ▶ が押せない", page.evaluate("[...document.querySelectorAll('.pp-hud .pp-b')].find(b=>b.textContent==='▶').disabled"))
    page.keyboard.press("Home"); page.wait_for_timeout(500)
    # 非表示スライド（5枚目）は とばす：4枚目から → で 6枚目
    for _ in range(3): page.keyboard.press("ArrowRight"); page.wait_for_timeout(500)
    check("スライドショー：3回進めて 4枚目", "4 / 6" in page.inner_text(".pp-count"), page.inner_text(".pp-count"))
    page.keyboard.press("ArrowRight"); page.wait_for_timeout(600)
    check("スライドショー：非表示の5枚目はとばして、4枚目の次は6枚目", "6 / 6" in page.inner_text(".pp-count"), page.inner_text(".pp-count"))
    # メモ表示
    page.keyboard.press("Home"); page.wait_for_timeout(500)
    page.keyboard.press("m"); page.wait_for_timeout(300)
    check("m キーで 発表者メモが出る", page.is_visible(".pp-shownote") and "あいさつ" in page.inner_text(".pp-shownote"))
    # タップ（クリック）で次へ
    page.mouse.click(700, 300); page.wait_for_timeout(600)
    check("画面の右側をクリックで 次へ", "2 / 6" in page.inner_text(".pp-count"), page.inner_text(".pp-count"))
    page.mouse.click(30, 300); page.wait_for_timeout(600)
    check("画面の左はしをクリックで 前へ", "1 / 6" in page.inner_text(".pp-count"), page.inner_text(".pp-count"))
    # 自動で進める
    page.click(".pp-auto"); page.wait_for_timeout(300)
    check("自動で進める：ボタンの文字が変わる", "とめる" in page.inner_text(".pp-auto"))
    page.click(".pp-auto")
    # Esc で閉じる
    page.keyboard.press("Escape"); page.wait_for_timeout(500)
    check("Esc でスライドショーが閉じる", page.locator(".pp-show").count() == 0 and page.evaluate("!document.body.classList.contains('pp-open')"))
    # 「いまのスライドから」
    page.evaluate("document.querySelectorAll('.pp-item')[3].scrollIntoView({block:'center'})"); page.wait_for_timeout(700)
    page.click("#fvShowHere"); page.wait_for_timeout(900)
    check("「いまのスライドから」：見ていた4枚目から始まる", "4 / 6" in page.inner_text(".pp-count"), page.inner_text(".pp-count"))
    page.screenshot(path="/tmp/pp/show4.png")
    page.click("text=✕ とじる"); page.wait_for_timeout(400)
    # 「ここから」
    page.click(".pp-item:nth-child(2) .pp-go"); page.wait_for_timeout(900)
    check("「▶ ここから」：2枚目から始まる", "2 / 6" in page.inner_text(".pp-count"))
    page.keyboard.press("Escape"); page.wait_for_timeout(300)
    # 守り
    ev = page.evaluate("""() => { const out = {}; const c = document.querySelector('.pp-item:nth-child(3) img');
        const ce = new MouseEvent('contextmenu', {bubbles: true, cancelable: true}); c.dispatchEvent(ce); out.ctx = ce.defaultPrevented;
        const de = new Event('dragstart', {bubbles: true, cancelable: true}); c.dispatchEvent(de); out.drag = de.defaultPrevented; return out; }""")
    check("スライド画面：右クリック・ドラッグが止まる", all(ev.values()), ev)
    # 中身が script / html として動いていない
    check("ページのエラーが出ていない", not errs, errs[:2])
    # ダウンロード
    with page.expect_download() as dl:
        page.click("#fvSave")
    check("ダウンロード：元のファイルと同じ名前・大きさ", dl.value.suggested_filename == "発表会.pptx" and len(open(dl.value.path(), "rb").read()) == len(FILES["r1/u/test.pptx"]), dl.value.suggested_filename)
    # こわれたファイル
    viewer(page, "r1/u/bad.pptx", "こわれた.pptx")
    check("こわれた pptx：案内が出て、ダウンロードできる", "表示できませんでした" in page.inner_text("#fvMain") and page.is_visible("#fvSave") and not page.is_visible("#fvShow"), page.inner_text("#fvMain")[:60])
    # 古い .ppt は、今までどおり（ダウンロードだけ）
    viewer(page, "r1/u/old.ppt", "古い.ppt", wait=1200)
    check("古い .ppt：今までどおり、ダウンロードだけ", "表示しません" in page.inner_text("#fvMain") and not page.is_visible("#fvShow"))
    browser.close()
print(f"\n{sum(res)}/{len(res)} 通過")
sys.exit(0 if all(res) else 1)
