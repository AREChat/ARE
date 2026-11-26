import sys, os, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
EXTRA = open(HERE + "/chat_test.py", encoding="utf-8").read().split('EXTRA = """')[1].split('"""')[0]
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
W = int(sys.argv[1]) if len(sys.argv) > 1 else 390
H = int(sys.argv[2]) if len(sys.argv) > 2 else 700
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=W, height=H, extra_fx=EXTRA, touch=True)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(6500)
    page.locator("#roomList button, #roomList .room, #roomList [data-room], #roomList > *").filter(has_text="みどり").first.click(); page.wait_for_timeout(1200)
    M = """() => { const r = (s) => { const e = document.querySelector(s); if(!e) return null; const b = e.getBoundingClientRect(); return {t: Math.round(b.top), h: Math.round(b.height), b: Math.round(b.bottom)}; };
      return {kb: document.body.classList.contains('kb-open'), ta: r('#messageInput'), msgs: r('#messages'), hdr: r('.chat-header'), comp: r('.composer'), vh: innerHeight, over: document.documentElement.scrollWidth > innerWidth + 1,
              taScroll: document.getElementById('messageInput').scrollHeight, taClient: document.getElementById('messageInput').clientHeight}; }"""
    page.evaluate("document.getElementById('messageInput').blur()"); page.wait_for_timeout(700)
    before = page.evaluate(M)
    check("入力前：キーボード状態ではない", not before["kb"], before)
    page.screenshot(path=f"/tmp/shots/kb_{W}_0before.png")
    page.tap("#messageInput"); page.wait_for_timeout(400)
    page.evaluate("document.getElementById('messageInput').focus()"); page.wait_for_timeout(300)
    longtext = "\n".join(f"これは長い文章の{i}行目です。キーボードを出したまま たくさん書いても 前の会話が見えるままにしたい。" for i in range(1, 31))
    page.evaluate("(t) => { const e = document.getElementById('messageInput'); e.value = t; e.dispatchEvent(new Event('input', {bubbles:true})); }", longtext)
    page.wait_for_timeout(400)
    after = page.evaluate(M)
    check("入力中：キーボード状態（kb-open）になる", after["kb"], after["kb"])
    cap = page.evaluate("composerMaxHeight()")
    check("長文でも 入力欄が上限（約4行）を超えない", after["ta"]["h"] <= cap + 2, f"高さ{after['ta']['h']} / 上限{cap}")
    check("入力欄の中でスクロールできる（中身は残っている）", after["taScroll"] > after["taClient"], f"{after['taScroll']} > {after['taClient']}")
    check("会話の表示エリアが 画面の 25% 以上ある", after["msgs"]["h"] >= after["vh"] * 0.25, f"{after['msgs']['h']}px / 画面{after['vh']}px")
    check("会話エリアは 入力前の半分以上を保つ", after["msgs"]["h"] >= before["msgs"]["h"] * 0.5 or after["msgs"]["h"] >= 150, f"{after['msgs']['h']} vs 入力前{before['msgs']['h']}")
    check("横にはみ出さない", not after["over"])
    page.screenshot(path=f"/tmp/shots/kb_{W}_1typing.png")
    # 前のメッセージが見えているか
    seen = page.evaluate("""() => { const m = document.getElementById('messages'); const mr = m.getBoundingClientRect(); return [...m.querySelectorAll('.message-row')].filter(e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.bottom > mr.top && r.top < mr.bottom; }).length; }""")
    check("前のメッセージが 画面に見えている", seen >= 1, seen)
    # 入力欄を離れたら元にもどる
    page.evaluate("document.getElementById('messageInput').blur()"); page.wait_for_timeout(700)
    rest = page.evaluate(M)
    check("入力欄を離れると 通常の状態にもどる", not rest["kb"], rest["kb"])
    page.evaluate("(t) => { const e = document.getElementById('messageInput'); e.value = ''; e.dispatchEvent(new Event('input', {bubbles:true})); }", "")
    page.wait_for_timeout(200)
    small = page.evaluate(M)
    check("文を消すと 入力欄が 小さくもどる", small["ta"]["h"] < 80, small["ta"])
    errs = [l for l in logs if l[0] in ("error", "pageerror") and "supabase" not in l[1].lower() and "Failed to load resource" not in l[1]]
    check("コンソールにエラーが出ない", not errs, errs[:3])
    browser.close()
print("結果:", sum(res), "/", len(res))
