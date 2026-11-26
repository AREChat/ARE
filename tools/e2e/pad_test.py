import sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import devs
from devs import *
srv = ensure_server()
EXTRA = open(HERE + "/chat_test.py", encoding="utf-8").read().split('EXTRA = """')[1].split('"""')[0]
PAGES = ["index.html","login.html","register.html","recovery.html","help.html","faq.html","guide.html","terms.html","privacy.html","credits.html","changelog.html","achievements.html","Quiz.html","404.html","chat.html","admin.html","game2/index.html","game3/index.html","game2/manual.html","game4/index.html","game5/index.html","game6/index.html","game7/index.html","daifugo/index.html","game5/play/index.html"]
PAD_INIT = """
(() => {
  const mk = () => ({ id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)', index: 0, connected: true, mapping: 'standard',
     buttons: Array.from({length: 17}, () => ({pressed: false, value: 0})), axes: [0,0,0,0], timestamp: 0 });
  window.__pad = mk();
  navigator.getGamepads = () => [window.__pad, null, null, null];
  window.__escCount = 0; window.__clicks = [];
  addEventListener('keydown', (e) => { if (e.key === 'Escape') window.__escCount++; }, true);
  addEventListener('click', (e) => { window.__clicks.push((e.target.textContent||e.target.id||e.target.tagName||'').trim().slice(0,12)); if (e.target.closest && e.target.closest('a[href]')) e.preventDefault(); }, true);
  window.__press = (i, on) => { window.__pad.buttons[i] = {pressed: !!on, value: on ? 1 : 0}; };
})();
"""
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
with sync_playwright() as p:
    for name, dev, land in [("PC-1366x768","PC",False), ("iPhone13-横","iPhone 13",True)]:
        for pg in PAGES:
            browser, ctx, page, logs = new_dev_page(p, name, dev, land, EXTRA)
            page.add_init_script(PAD_INIT)
            try:
                page.goto(devs.BASE + "/" + pg, wait_until="domcontentloaded"); page.wait_for_timeout(1500)
            except Exception as e:
                check(f"[{name}] {pg} 開ける", False, str(e)[:80]); browser.close(); continue
            own = page.evaluate("() => typeof window.__arePad !== 'undefined'")
            tag = f"[{name}] {pg} "
            if not own:
                check(tag + "（共通パッドは読み込まれない＝そのページ専用の対応）", True, "skip"); browser.close(); continue
            page.evaluate("() => window.dispatchEvent(new Event('gamepadconnected'))"); page.wait_for_timeout(200)
            f0 = page.evaluate("() => { const e=document.querySelector('.are-pad-focus'); return e ? (e.textContent||e.id||e.tagName).trim().slice(0,14) : null }")
            # A（右ボタン）：つないだ直後の「えらばれたボタン」をおす
            try:
                page.evaluate("() => { window.__clicks.length = 0; window.__press(1, true); }"); page.wait_for_timeout(150); page.evaluate("() => window.__press(1, false)"); page.wait_for_timeout(200)
                clicks = page.evaluate("() => window.__clicks.slice(0,3)")
            except Exception as e:
                clicks = ['(移動した)']
            # 右・下へ動かす（画面の外につづくときは自動スクロール）
            for btn in (15, 13, 13):
                page.evaluate("(i) => window.__press(i, true)", btn); page.wait_for_timeout(450); page.evaluate("(i) => window.__press(i, false)", btn); page.wait_for_timeout(150)
            f1 = page.evaluate("() => { const e=document.querySelector('.are-pad-focus'); return e ? (e.textContent||e.id||e.tagName).trim().slice(0,14) : null }")
            # B(下)=もどる/Escape, +=Escape
            page.evaluate("() => window.__press(0, true)"); page.wait_for_timeout(120); page.evaluate("() => window.__press(0, false)"); page.wait_for_timeout(120)
            page.evaluate("() => window.__press(9, true)"); page.wait_for_timeout(120); page.evaluate("() => window.__press(9, false)"); page.wait_for_timeout(120)
            esc = page.evaluate("() => window.__escCount")
            errs = [l for l in logs if (l[0] == "pageerror" or "uncaught" in l[1].lower()) and "boom" not in l[1]]
            check(tag + "つなぐと最初のボタンが光る（最初に見えるボタンが無いページは、下キーのスクロールで見つかる）", f0 is not None or f1 is not None, f"{f0} / 下キー後 {f1}")
            check(tag + "十字キー（右・下）でフォーカスが動く", f1 is not None, f"{f0} → {f1}")
            check(tag + "B・＋ボタンで Esc が2回届く", esc >= 2, esc)
            check(tag + "A（右ボタン）でクリックが届く（最初に見えるボタンが無いページは対象外）", len(clicks) >= 1 or f0 is None, clicks)
            check(tag + "画面のエラー0", not errs, errs[:2])
            browser.close()
print(f"結果: OK={sum(res)} NG={len(res)-sum(res)}")
