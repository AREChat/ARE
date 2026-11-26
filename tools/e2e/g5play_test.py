import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""), flush=True)
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=1100, height=700, touch=False); page.set_default_timeout(8000)
    page.add_init_script("window.__audios=[];(function(){const A=window.Audio;window.Audio=function(s){const a=new A(s);window.__audios.push(a);return a;};window.Audio.prototype=A.prototype;})();")
    page.goto(BASE + "/game5/play/index.html", wait_until="load"); page.wait_for_timeout(3000)
    def ui(): return page.evaluate("document.getElementById('ui').innerText.replace(/\\s+/g,' ')")
    def clickt(t): return page.evaluate("(t) => { const b=[...document.querySelectorAll('#ui button')].filter(x=>x.offsetParent!==null).find(x=>(x.innerText||'').trim().includes(t)); if(b){ b.click(); return true; } return false; }", t)
    check("タイトルに「はじめから」「つづきから」「章選択」がある", all(w in ui() for w in ("はじめから", "つづきから", "章選択")), ui()[:60])
    clickt("章選択"); page.wait_for_timeout(800)
    t = ui(); import re as _re
    check("章選択で 全10章の一覧が出る（クリア済みの章だけ選べる）", len(set(_re.findall(r"(?:第\d+章|最終章)", t))) >= 10, sorted(set(_re.findall(r"(?:第\d+章|最終章)", t)))[-3:])
    clickt("戻"); page.wait_for_timeout(500)
    if "はじめから" not in ui(): page.reload(wait_until="load"); page.wait_for_timeout(2500)
    clickt("はじめから"); page.wait_for_timeout(2500)
    reached = False
    for i in range(40):
        if "問題" in ui(): reached = True; break
        if not clickt("次へ"): page.keyboard.press("Enter")
        page.wait_for_timeout(450)
    check("はじめから → 会話を進めて 最初の問題（推理パズル）まで進める", reached, ui()[:80])
    aus = page.evaluate("window.__audios.map(a => decodeURIComponent(a.src.split('/').pop()))")
    check("BGM が鳴る（タイトル→物語→パズル）", len(aus) >= 3, aus[:5])
    # BGM のループ：ふつうの loop 属性ではなく「終わったら同じ曲をもう一度始める」作り
    before = page.evaluate("window.__audios.length")
    page.evaluate("(() => { const a = window.__audios[window.__audios.length - 1]; a.muted = true; a.dispatchEvent(new Event('ended')); })()")
    page.wait_for_timeout(1200)
    after = page.evaluate("window.__audios.length")
    last = page.evaluate("window.__audios.map(a => decodeURIComponent(a.src.split('/').pop()))")
    check("BGM のループ：曲が終わると 同じ曲がもう一度始まる", after > before and last[-1] == last[before - 1], (before, after, last[-2:]))
    # セーブ → 再読み込み → つづきから
    clickt("セーブ"); page.wait_for_timeout(1000)
    t = ui(); print("   セーブ画面:", t[:120])
    for w in ("1", "スロット", "保存", "OK"):
        pass
    keys = page.evaluate("Object.keys(localStorage).filter(k => !/^(ll_tips_off|are_gtips_off|are_tips_off_u-me)$/.test(k))")
    if not keys:
        # スロットを選ぶ画面なら最初のスロットを押す
        page.evaluate("(() => { const b=[...document.querySelectorAll('#ui button')].filter(x=>x.offsetParent!==null && /スロット|セーブ|保存|1/.test(x.innerText||'') && !/タイトル/.test(x.innerText||'')); if(b[1]) b[1].click(); })()"); page.wait_for_timeout(800)
        keys = page.evaluate("Object.keys(localStorage).filter(k => !/^(ll_tips_off|are_gtips_off|are_tips_off_u-me)$/.test(k))")
    check("セーブすると ブラウザに保存される", len(keys) >= 1, keys[:3])
    page.reload(wait_until="load"); page.wait_for_timeout(2500)
    clickt("つづきから"); page.wait_for_timeout(2000)
    t = ui(); check("つづきから で 保存した場面にもどれる", "第1章" in t or "問題" in t, t[:80])
    errs = [l for l in logs if l[0] in ("error", "pageerror") and "Failed to load" not in l[1] and "ERR_" not in l[1] and "beforeunload" not in l[1]]
    check("画面のエラーなし", not errs, errs[:3])
    page.screenshot(path="/tmp/are-e2e/shots_games/g5play_final.png")
    browser.close()
print("合計", len(res), "失敗", res.count(False))
if srv: srv.terminate()
