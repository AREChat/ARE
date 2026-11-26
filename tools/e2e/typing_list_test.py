import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""), flush=True)
WRAP = """
(function(){
  window.__chanLog = [];
  const iv = setInterval(function(){
    const s = window.areSupabase; if(!s || s.__wrapped) return;
    const orig = s.channel; s.__wrapped = true;
    s.channel = function(name, opts){ window.__chanLog.push(name); return orig.apply(this, arguments); };
    const rm = s.removeChannel; window.__removed = []; s.removeChannel = function(ch){ window.__removed.push(1); return rm.apply(this, arguments); };
    clearInterval(iv);
  }, 0);
})();
"""
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=1100, height=800, touch=False)
    ctx.add_init_script(WRAP)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2500)
    chans = page.evaluate("Object.keys(window.__channels).filter(k => k.startsWith('typing:'))")
    check("起動すると、参加している部屋ぶんの入力中チャンネルがつながる（r1・r2）", "typing:r1" in chans and "typing:r2" in chans, chans)
    log0 = page.evaluate("window.__chanLog.filter(n => n.startsWith('typing:'))")
    check("同じ部屋のチャンネルを 2 回つながない（開く前）", len(log0) == len(set(log0)), log0)
    rows = page.locator("#roomList [data-room-id]")
    check("一覧に 2 件ある", rows.count() >= 2, rows.count())
    r1 = page.locator('#roomList [data-room-id="r1"]'); r2 = page.locator('#roomList [data-room-id="r2"]')
    name1 = r1.locator("strong").inner_text(); name2 = r2.locator("strong").inner_text(); print("r1:", name1, "r2:", name2)
    check("入力中でない間は、一覧に「入力中」が出ない", page.locator("#roomList .rt-typing").count() == 0)
    pres_before = r1.inner_text()
    # r1 を開く
    r1.click(); page.wait_for_timeout(1500)
    log1 = page.evaluate("window.__chanLog.filter(n => n.startsWith('typing:'))")
    check("r1 を開いても、同じ部屋のチャンネルが 2 本にならない", log1.count("typing:r1") == 1, log1)
    # 相手(u1)が r1 で入力中
    page.evaluate("window.__emit('typing:r1','broadcast',{payload:{uid:'u1',name:'" + name1 + "'}},'typing'); undefined")
    page.wait_for_timeout(700)
    check("開いているチャット画面の上に「入力中」が出る(#typingLine)", "入力中" in page.inner_text("#typingLine"), page.inner_text("#typingLine"))
    check("チャットの上部（名前の下）に「✏️ 入力中…」が出る", page.locator("#nkTyping").is_visible() and "入力中" in page.inner_text("#nkTyping"))
    check("★左の一覧の、その相手の行に「✏️ 入力中…」が出る", r1.locator(".rt-typing").count() == 1 and "入力中" in r1.locator(".rt-typing").inner_text(), r1.inner_text().replace("\n", " | "))
    check("入力中の間は、一覧の「オフライン…」の行は隠れる", not r1.locator(".person-text small:not(.rt-typing)").first.is_visible())
    check("他の人（r2）の行には 出ない", r2.locator(".rt-typing").count() == 0)
    # 自分の uid は無視
    page.evaluate("window.__emit('typing:r2','broadcast',{payload:{uid:'u-me',name:'じぶん'}},'typing'); undefined"); page.wait_for_timeout(500)
    check("自分（u-me）の入力中の合図は、一覧に出さない", r2.locator(".rt-typing").count() == 0)
    # 開いていない部屋(r2)で相手が入力中
    page.evaluate("window.__emit('typing:r2','broadcast',{payload:{uid:'u2',name:'" + name2 + "'}},'typing'); undefined"); page.wait_for_timeout(700)
    check("★開いていない部屋（r2）の入力中も、左の一覧に出る", r2.locator(".rt-typing").count() == 1, r2.inner_text().replace("\n", " | "))
    check("開いているチャット画面は r1 のまま（r2 の入力中は出ない）", page.inner_text("#chatTitle").find(name1) >= 0 and "入力中" in page.inner_text("#typingLine"))
    # 時間切れ（4秒）で消える
    page.wait_for_timeout(5200)
    check("4秒たつと、一覧の「入力中」が消えて、元の表示に戻る", page.locator("#roomList .rt-typing").count() == 0 and r1.locator(".person-text small").first.is_visible(), r1.inner_text().replace("\n", " | "))
    check("チャット画面の入力中も消える", page.inner_text("#typingLine").strip() == "" and not page.locator("#nkTyping").is_visible())
    # 自分が入力中 → チャット画面だけ
    page.fill("#messageInput", ""); page.click("#messageInput"); page.keyboard.type("あ", delay=50); page.wait_for_timeout(700)
    check("自分が入力中のときは、チャット画面に「自分が入力中」が出る", "自分が入力中" in page.inner_text("#typingLine"), page.inner_text("#typingLine"))
    check("自分が入力中のときは、左の一覧には何も出ない", page.locator("#roomList .rt-typing").count() == 0 and "自分" not in page.inner_text("#roomList"))
    sent = page.evaluate("window.__channels['typing:r1'].sent.length")
    check("自分が入力すると、開いている部屋のチャンネルへ合図が送られる", sent >= 1, sent)
    # 部屋を切りかえ
    r2.click(); page.wait_for_timeout(1200)
    log2 = page.evaluate("window.__chanLog.filter(n => n.startsWith('typing:'))")
    check("r2 に切りかえても、チャンネルが増えない（部屋ごとに 1 本）", log2.count("typing:r2") == 1 and log2.count("typing:r1") == 1, log2)
    page.evaluate("window.__emit('typing:r1','broadcast',{payload:{uid:'u1',name:'" + name1 + "'}},'typing'); undefined"); page.wait_for_timeout(600)
    check("r2 を開いている間に r1 が入力中 → 一覧の r1 に出て、チャット画面(r2)には出ない", page.locator('#roomList [data-room-id="r1"] .rt-typing').count() == 1 and "入力中" not in page.inner_text("#typingLine").replace("自分が入力中", ""), page.inner_text("#typingLine"))
    # 一覧が作り直されても 出続ける
    page.evaluate("window.__emit('typing:r2','broadcast',{payload:{uid:'u2',name:'" + name2 + "'}},'typing'); undefined"); page.wait_for_timeout(500)
    page.evaluate("renderRooms(); undefined") if False else None
    page.click("text=更新", timeout=2000) if page.locator("#refreshRoomsButton").count() == 0 else page.click("#refreshRoomsButton"); page.wait_for_timeout(900)
    check("一覧を更新（作り直し）しても、入力中の表示が出続ける", page.locator("#roomList .rt-typing").count() >= 1, page.locator("#roomList .rt-typing").count())
    errs = [l for l in logs if l[0] == "pageerror" or (l[0] == "error" and "Failed to load" not in l[1])]
    fe = page.evaluate("window.__fakeErrors || []")
    check("画面のエラーなし", not errs and not fe, (errs[:2], fe[:2]))
    page.screenshot(path="/tmp/r3/zt/typing_list.png")
    browser.close()
print("合計", len(res), "失敗", res.count(False))
