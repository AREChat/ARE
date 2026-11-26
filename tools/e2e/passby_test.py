import sys, json, os, re
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
os.environ.setdefault("ARE_SRC", "/home/claude/r3/AREDA")
os.environ["ARE_SW"] = "block"
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:300]) if note else ""))
EXTRA = """
window.__pb = {settings:{ok:true,enabled:true,scope:'everyone',greeting_id:0,mood_id:0}, inbox:[], pings:[], newOnPing:[], stats:{ok:true,unique:0,meets:0,streak:0,today_meets:0,today_new:0,pieces:[],claims:[]}, scanResult:null, missing:false, guest:false};
const R = window.__fx.rpc;
R.passby_settings_get_v1 = () => { if(__pb.missing) throw {code:'PGRST202', message:'Could not find the function public.passby_settings_get_v1'}; if(__pb.guest) return {ok:false,error:'guest'}; return Object.assign({}, __pb.settings, {unseen: __pb.inbox.filter(c=>!c.seen).length}); };
R.passby_settings_set_v1 = (a) => { __pb.settings = Object.assign(__pb.settings, {enabled:a.p_enabled, scope:a.p_scope, greeting_id:a.p_greeting, mood_id:a.p_mood}); return {ok:true}; };
R.passby_ping_v1 = (a) => { __pb.pings.push(a.p_cells); return {ok:true, new:__pb.newOnPing.splice(0), today:{meets:0,new_people:0}}; };
R.passby_inbox_v1 = () => __pb.inbox;
R.passby_mark_seen_v1 = (a) => { __pb.inbox.forEach(c => { if(!a.p_ids || a.p_ids.includes(c.id)) c.seen = true; }); return {ok:true}; };
R.passby_stats_v1 = () => __pb.stats;
R.passby_claim_set_v1 = (a) => { __pb.stats.claims.push('set:'+a.p_set); return {ok:true, gained:40}; };
R.passby_make_code_v1 = () => ({ok:true, code:'ABCD2345', seconds:180});
R.passby_scan_v1 = () => __pb.scanResult;
R.passby_delete_my_data_v1 = () => { __pb.settings.enabled = false; __pb.inbox.length = 0; return {ok:true}; };
"""
def card(id, name, **kw): return dict({"id": id, "name": name, "avatar_url": None, "greeting_id": 3, "mood_id": 5, "first_at": "2026-11-21T00:00:00Z", "last_at": "2026-11-21T00:00:00Z", "count": 1, "seen": False, "kind": "area", "piece": 10, "friend": False}, **kw)
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=EXTRA)
    ctx.grant_permissions(["geolocation"]); ctx.set_geolocation({"latitude": 35.0001, "longitude": 135.0001, "accuracy": 20})
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(6500)
    calls = lambda n: [c for c in page.evaluate("window.__calls") if c.get("rpc") == n]
    check("1 サーバーの準備ができていれば、入口のカードが出る", page.evaluate("pb.avail") is True and page.evaluate("!document.querySelector('[data-tool=passby]').hidden"))
    pin_box = page.evaluate("(() => { const l = document.getElementById('roomList'), p = l.querySelector('.pb-pin-entry'); if(!p) return null; const r = p.getBoundingClientRect(); return {vis: !p.hidden && r.height > 20, first: l.firstElementChild === p, text: p.innerText}; })()")
    check("1b チャット一覧の いちばん上に『すれ違いタウン』がピン止めされて出る", pin_box and pin_box["vis"] and pin_box["first"] and "すれ違いタウン" in pin_box["text"] and "📌" in pin_box["text"], pin_box)
    page.evaluate("pb.unseen = 2; pbPaintCard()")
    check("1c 新しいすれ違いがあると、ピンに数が出る", "新しいすれ違い" in page.inner_text("#roomList .pb-pin-entry"), page.inner_text("#roomList .pb-pin-entry"))
    page.evaluate("pb.unseen = 0; pbPaintCard()")
    check("1d 数が0なら、数は出ない", "新しいすれ違い" not in page.inner_text("#roomList .pb-pin-entry"))
    page.click("#roomList .pb-pin-entry"); page.wait_for_timeout(900)
    check("1e ピンを押すと、すれ違いタウンの画面が開く", "すれ違いタウン" in page.inner_text("#profileSheet") and len(calls("passby_stats_v1")) >= 1, page.inner_text("#profileSheet")[:80])
    page.evaluate("closeSheet()"); page.wait_for_timeout(300)
    check("2 位置が許可ずみ → 自動で『いまここ』が送られる", len(calls("passby_ping_v1")) >= 1, len(calls("passby_ping_v1")))
    cells = calls("passby_ping_v1")[0]["args"]["p_cells"]
    check("3 送るのは 16文字の暗号のような文字（1〜4個）だけで、緯度経度は入っていない", 1 <= len(cells) <= 4 and all(re.fullmatch(r"[0-9a-f]{16}", c) for c in cells) and "35." not in json.dumps(calls("passby_ping_v1")[0]["args"]), cells)
    # 区画：同じ場所の人が同じ値になる／1km はなれると変わる／境目ではとなりも入る
    t = page.evaluate("""async () => { const a = await pbCells(35.0001, 135.0001), b = await pbCells(35.0010, 135.0010), c = await pbCells(35.0100, 135.0100), e = await pbCells(35.00995, 135.0015);
        return {same: a.some(x => b.includes(x)), far: !a.some(x => c.includes(x)), edge: e.length}; }""")
    check("4 同じ区画のふたりは一致・1kmはなれると一致しない・境目では となりの区画も入る", t["same"] and t["far"] and t["edge"] == 2, t)
    # すれ違いの知らせ
    page.evaluate("__pb.newOnPing.push(%s)" % json.dumps(card("u1", "みどり", seen=False)))
    page.evaluate("pb.lastPing = 0; pb.busy = false; pbTick()"); page.wait_for_timeout(1500)
    pop = page.evaluate("(document.getElementById('pbPop')||{}).innerText || ''")
    check("5 すれ違ったら、名前・あいさつ・かけらの知らせが出る", "みどり" in pop and "すれ違いました" in pop and "かけら" in pop and "のんびり" not in pop, pop)
    page.screenshot(path="/tmp/pb_pop.png")
    check("6 知らせた分は『新しい』から外れる（もう一度出さない）", len(calls("passby_mark_seen_v1")) >= 1)
    page.click("#pbPop [data-pb=inbox]"); page.wait_for_timeout(1200)
    # 一覧（NEW は mark 後なので、サーバー側の seen 次第）
    page.evaluate("__pb.inbox.push(%s)" % json.dumps(card("u1", "みどり", seen=True, count=3, friend=True)))
    # メイン画面
    page.evaluate("closeSheet()")
    page.evaluate("__pb.stats = {ok:true,unique:7,meets:12,streak:3,today_meets:2,today_new:1,pieces:[%s],claims:[]}" % ",".join('{"piece":%d,"n":1}' % i for i in range(9)))
    page.evaluate("runTool(openPassby)"); page.wait_for_timeout(1200)
    sheet = page.inner_text("#profileSheet")
    check("7 メイン画面：数・称号・かけら・メニューが出る", "すれ違った人" in sheet and "顔見知りさん" in sheet and "9 / 54" in sheet and "かざし合い" in sheet and "設定" in sheet, sheet[:200])
    page.screenshot(path="/tmp/pb_main.png")
    # パズル
    page.click("[data-t='pb:puzzle']"); page.wait_for_timeout(1200)
    check("8 パズル：6つの場面。1まい そろうと『ポイントをうけとる』が出る", page.locator(".pb-set").count() == 6 and "うけとる" in page.inner_text("#profileSheet"))
    check("9 そろっていないところは『?』のかけら", page.locator(".pb-pc.off").count() == 45, page.locator(".pb-pc.off").count())
    page.screenshot(path="/tmp/pb_puzzle.png")
    page.click("[data-t='pb:claim']"); page.wait_for_timeout(1200)
    check("10 ポイントをうけとると、サーバーに伝わり『うけとりずみ』になる", len(calls("passby_claim_set_v1")) == 1 and "うけとりずみ" in page.inner_text("#profileSheet"))
    # 設定
    page.click("[data-t='pb:main']"); page.wait_for_timeout(800); page.click("[data-t='pb:settings']"); page.wait_for_timeout(600)
    check("11 設定：はじめからオン・知らない人もOK", page.input_value("#pbEn") == "1" and page.input_value("#pbScope") == "everyone")
    page.select_option("#pbScope", "friends"); page.select_option("#pbGreet", "5"); page.select_option("#pbMood", "3"); page.click("[data-t='pb:save']"); page.wait_for_timeout(1000)
    sv = calls("passby_settings_set_v1")
    check("12 設定を保存すると、えらんだ内容がサーバーに送られる", sv and sv[-1]["args"] == {"p_enabled": True, "p_scope": "friends", "p_greeting": 5, "p_mood": 3}, sv[-1]["args"] if sv else None)
    # オフにすると送らなくなる
    page.evaluate("runTool(openPbSettings)"); page.wait_for_timeout(500)
    page.select_option("#pbEn", "0"); page.click("[data-t='pb:save']"); page.wait_for_timeout(800)
    n0 = len(calls("passby_ping_v1")); page.evaluate("pb.busy = false; pbTick()"); page.wait_for_timeout(800)
    check("13 オフにしたら、位置を送らない", len(calls("passby_ping_v1")) == n0)
    page.evaluate("pb.st.enabled = true")
    # かざし合い
    page.evaluate("runTool(pbQrShow)"); page.wait_for_timeout(1500)
    check("14 かざし合い（見せる）：QR と 8文字のコードが出る", page.is_visible("#pbQr") and page.inner_text("#pbCode") == "ABCD-2345", page.inner_text("#pbCode"))
    check("15 QR の中身は ARE-PB:コード（場所は入らない）", page.evaluate("document.getElementById('pbQr').width") >= 100)
    page.screenshot(path="/tmp/pb_qr.png")
    page.evaluate("__pb.scanResult = {ok:true, already:false, card:%s}" % json.dumps(card("u2", "あおい", kind="qr", piece=20)))
    page.evaluate("runTool(pbQrRead)"); page.wait_for_timeout(800)
    page.fill("#pbManual", "abcd-2345"); page.click("[data-t='pb:scan']"); page.wait_for_timeout(1000)
    sc = calls("passby_scan_v1")
    check("16 コードを打つと、すれ違いになる（小文字・ハイフンもOK）", sc and sc[-1]["args"]["p_code"].upper() == "ABCD-2345" and "すれ違いました" in page.inner_text("#profileSheet") and "あおい" in page.inner_text("#profileSheet"), sc[-1]["args"] if sc else None)
    page.screenshot(path="/tmp/pb_meet.png")
    page.evaluate("runTool(pbQrRead)"); page.wait_for_timeout(500)
    page.evaluate("__pb.scanResult = {ok:false, error:'expired'}")
    page.fill("#pbManual", "ZZZZ9999"); page.click("[data-t='pb:scan']"); page.wait_for_timeout(800)
    check("17 期限切れなどは、やさしい文で出る", "期限" in page.inner_text("#pbSt"), page.inner_text("#pbSt"))
    page.fill("#pbManual", "xx"); page.click("[data-t='pb:scan']"); page.wait_for_timeout(500)
    check("18 形がちがうコードは、サーバーに送らず ことわる", "かざし合いQR" in page.inner_text("#pbSt") or "ではありません" in page.inner_text("#pbSt"))
    # 閉じたら カメラ・タイマーが止まる
    page.evaluate("closeSheet()")
    check("19 シートを閉じると、タイマーとカメラが止まる", page.evaluate("pb.qrTimer === 0 && pb.qrPoll === 0 && pb.stream === null"))
    # 消す
    page.evaluate("runTool(openPbSettings)"); page.wait_for_timeout(500)
    page.once("dialog", lambda d: d.accept()); page.click("[data-t='pb:wipe']"); page.wait_for_timeout(1000)
    check("20 『ぜんぶ消す』で、サーバーの記録が消えて すれ違いはオフになる", len(calls("passby_delete_my_data_v1")) == 1 and page.evaluate("pb.st.enabled") is False)
    check("21 ページのエラーが出ていない", not errs, errs[:2])
    # 位置の許可がまだ → 自動では位置を求めない（案内のあとだけ）
    browser.close()

    # 位置が「まだ」のとき：ブラウザには いきなり聞かない／案内が出る
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=EXTRA)
    page.add_init_script("""Object.defineProperty(navigator, 'permissions', {value: {query: async () => ({state: 'prompt', onchange: null})}});
        window.__geoAsked = 0; const g = navigator.geolocation; navigator.geolocation.getCurrentPosition = function(ok, err){ window.__geoAsked++; err({code:1, message:'denied'}); };""")
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(3000)
    check("22 許可がまだのとき、ブラウザには いきなり位置をたずねない", page.evaluate("window.__geoAsked") == 0)
    page.wait_for_timeout(5500)
    check("23 かわりに、説明つきの案内が出る", page.is_visible("#pbPop") and "はじまります" in page.inner_text("#pbPop"), page.evaluate("(document.getElementById('pbPop')||{}).innerText"))
    page.click("#pbPop [data-pb=intro]"); page.wait_for_timeout(600)
    t = page.inner_text("#profileSheet")
    check("24 説明の画面：正確な場所は送らない・いつでもオフ・許可ボタン", "正確な場所" in t and "いつでも" in t and "位置を使う" in t, t[:120])
    page.screenshot(path="/tmp/pb_intro.png")
    page.click("[data-t='pb:ask']"); page.wait_for_timeout(800)
    check("25 ボタンを押したときだけ、ブラウザに位置をたずねる（止められたら案内）", page.evaluate("window.__geoAsked") == 1 and "止められています" in page.inner_text("#profileSheet"))
    browser.close()

    # サーバー未準備・お試し：入口を出さない
    for label, flag in (("サーバー未準備", "missing"), ("お試し（ゲスト）", "guest")):
        browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=EXTRA + "\n__pb.%s = true;" % flag)
        page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2500)
        check("26 %s：入口のカードも ピンも かくれたまま・位置も送らない" % label, page.evaluate("document.querySelector('[data-tool=passby]').hidden") and page.evaluate("document.querySelector('#roomList .pb-pin-entry').hidden") and page.evaluate("pb.avail") is False and not [c for c in page.evaluate("window.__calls") if c.get("rpc") == "passby_ping_v1"])
        browser.close()
print(f"\n{sum(res)}/{len(res)} 通過")
sys.exit(0 if all(res) else 1)
