from c12fx import *
import json
srv = ensure_server()
OPENERS = ["openYoseList","openCapsule","openTodo","openOmikuji","openTrip","openOneLine","openQuiet","openSecretRoom","openDigest","openBirthdays","openEasy","openQuizMaker"]
with sync_playwright() as p:
    browser, ctx, page, logs = open_chat(p)
    enter(page, "r3")
    page.evaluate("window.__toasts=[]; (function(){ const o=showToast; showToast=function(m){window.__toasts.push(m); return o.apply(this,arguments)} })();")
    # ---- 12) ミニ検定 ----
    def toast(): return " / ".join(t or "" for t in page.evaluate("window.__toasts"))
    page.evaluate("openQuizMaker()"); page.wait_for_selector("#qzTitle")
    click_t(page, "[data-t='qz:post']"); check("検定：名前が空だと断る", "名前" in toast() and not page.evaluate("window.__fx.tables.messages.some(m=>m.content.includes('\"quiz\"'))"))
    page.fill("#qzTitle", "<i>テスト</i>検定"); click_t(page, "[data-t='qz:post']"); check("検定：問題文が空だと断る", "問題文" in toast())
    page.fill("#qzQ0", "1+1は？"); page.fill("#qzO0_0", "1"); page.fill("#qzO0_1", ""); page.fill("#qzO0_2", ""); page.fill("#qzO0_3", "")
    click_t(page, "[data-t='qz:post']"); check("検定：選択肢が1つだけだと断る", "2つ以上" in toast())
    page.fill("#qzO0_1", "2"); page.locator("input[name='qzA0'][value='3']").check(); click_t(page, "[data-t='qz:post']")
    check("検定：正解に空の選択肢を選ぶと断る", "空の選択肢" in toast())
    page.locator("input[name='qzA0'][value='1']").check(); page.fill("#qzO0_0", "2"); click_t(page, "[data-t='qz:post']")
    check("検定：同じ選択肢があると断る", "同じ選択肢" in toast())
    page.fill("#qzO0_0", "1"); page.fill("#qzO0_2", ""); page.fill("#qzO0_3", "3")   # 空きがあっても詰めて正解がずれないか
    page.locator("input[name='qzA0'][value='3']").check()
    click_t(page, "[data-t='qz:add']"); page.fill("#qzQ1", "空の色は？"); page.fill("#qzO1_0", "あお"); page.fill("#qzO1_1", "みどり"); page.fill("#qzE1", "晴れた日は青です。")
    n_add = 1
    for i in range(12): 
        if page.locator("[data-t='qz:add']:not([disabled])").count(): click_t(page, "[data-t='qz:add']")
    check("検定：問題は10問まで（ふやすボタンが止まる）", page.locator("[id^='qzQ']").count() == 10 and page.locator("[data-t='qz:add'][disabled]").count() == 1)
    for i in range(9, 1, -1): click_t(page, "[data-t='qz:del'][data-i='%d']" % i)
    check("検定：消すと問題が減る・入力は残る", page.locator("[id^='qzQ']").count() == 2 and page.input_value("#qzQ0") == "1+1は？" and page.input_value("#qzO1_0") == "あお")
    click_t(page, "[data-t='qz:post']"); page.wait_for_timeout(700)
    posted = [json.loads(m["content"]) for m in page.evaluate("window.__fx.tables.messages") if '"quiz"' in m["content"]]
    check("検定：出せる（2問・正解の番号が詰めたあとの位置に直る）", len(posted) == 1 and len(posted[0]["q"]) == 2 and posted[0]["q"][0]["o"] == ["1", "2", "3"] and posted[0]["q"][0]["a"] == 2 and posted[0]["title"] == "<i>テスト</i>検定", posted)
    page.wait_for_timeout(600)
    check("検定：チャットに「挑戦」のカードが出る（HTMLは文字のまま）", page.locator("[data-openquiz]").count() >= 1 and "&lt;i&gt;" in page.inner_html(".bubble:has([data-openquiz]) b") )
    # 挑戦
    page.locator("[data-openquiz]").last.click(); page.wait_for_timeout(300)
    check("検定：挑戦画面が開く（第1問・4択ではなく3択）", "第 1 問 / 2" in sheet_text(page) and page.locator("[data-t='qz:pick']").count() == 3)
    click_t(page, "[data-t='qz:pick'][data-i='0']"); check("検定：まちがえると「ざんねん・正解はC」", "ざんねん" in sheet_text(page) and "正解は C" in sheet_text(page))
    before = sheet_text(page); page.locator("[data-t='qz:pick']").nth(2).click({force: True}) if page.locator("[data-t='qz:pick']:not([disabled])").count() else None
    check("検定：答えたあとは選びなおせない", "いまの正解数：0" in sheet_text(page))
    click_t(page, "[data-t='qz:next']"); click_t(page, "[data-t='qz:pick'][data-i='0']")
    check("検定：正解すると⭕・解説が出る", "⭕" in sheet_text(page) and "晴れた日は青です" in sheet_text(page))
    click_t(page, "[data-t='qz:next']"); check("検定：結果 1 / 2・「がんばりました」", "1 / 2" in sheet_text(page) and "がんばりました" in sheet_text(page))
    click_t(page, "[data-t='qz:send']"); page.wait_for_timeout(600)
    check("検定：結果をチャットに送れる", any("1 / 2 点" in json.loads(m["content"]).get("text", "") for m in page.evaluate("window.__fx.tables.messages") if m["content"].startswith("{")))
    click_t(page, "[data-t='qz:again']"); click_t(page, "[data-t='qz:pick'][data-i='2']"); click_t(page, "[data-t='qz:next']"); click_t(page, "[data-t='qz:pick'][data-i='0']"); click_t(page, "[data-t='qz:next']")
    check("検定：もういちどで満点・マスター", "2 / 2" in sheet_text(page) and "マスター" in sheet_text(page))
    page.evaluate("closeSheet()"); page.evaluate("loadMessages(false)"); page.wait_for_timeout(700)
    check("検定：カードに自己ベスト（2/2）が出る", "2 / 2" in page.inner_text(".bubble:has([data-openquiz])"), page.inner_text(".bubble:has([data-openquiz])"))
    # こわれたカード
    page.evaluate("window.__fx.tables.messages.unshift({id:'qbad', room_id:'r3', sender_id:'u1', content:JSON.stringify({type:'quiz', id:'zz', title:'こわれ', q:'あ'}), created_at:new Date(Date.now()+500000).toISOString(), edited_at:null, expires_at:null, is_auto_reply:false})")
    page.evaluate("loadMessages(false)"); page.wait_for_timeout(700)
    check("検定：こわれたデータでも画面エラーにならない", not errors(page, logs), errors(page, logs))
    page.evaluate("document.getElementById('qzTitle')")  # noop
    page.evaluate("closeSheet()")
    print("エラー(内容):", errors(page, logs))
    # ---- 各機能のシートが画面からはみ出さない（スマホ幅・パソコン幅） ----
    for (w, h) in [(390, 760), (1280, 800), (320, 640)]:
        page.set_viewport_size({"width": w, "height": h}); page.wait_for_timeout(300)
        bad = []
        for fn in OPENERS:
            page.evaluate("closeSheet()"); page.evaluate(fn + "()"); page.wait_for_timeout(450)
            r = page.evaluate("""() => { const s = document.getElementById('profileSheet'); if(!s) return null; const b = s.getBoundingClientRect(); const over = [...s.querySelectorAll('*')].filter(e => e.offsetParent && e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('.bd-grid, .qt-day')).length; return {w:b.width, over, sw: s.scrollWidth - s.clientWidth, txt: s.innerText.length}; }""")
            if not r or r["over"] or r["sw"] > 2 or r["txt"] < 10: bad.append((fn, r))
        check("表示：%dpx幅で12個のシートがはみ出さない" % w, not bad, bad)
        page.evaluate("closeSheet()")
    page.set_viewport_size({"width": 390, "height": 760})
    # ---- 新しい種類のメッセージが並んだ画面（バブルの見た目） ----
    page.evaluate("""() => { const now = Date.now(); const mk = (id, c, k) => ({id, room_id:'r3', sender_id: k ? 'u-me':'u1', content: JSON.stringify(c), created_at:new Date(now + 800000 + k*1000 + Math.random()).toISOString(), edited_at:null, expires_at:null, is_auto_reply:false});
      window.__fx.tables.messages.unshift(mk('n1', {type:'capsule', text:'未来のわたしへ。げんきですか？', open_at:'2027-11-25'}, 1), mk('n2', {type:'yosegaki_open', id:'zz', title:'卒業おめでとう', bg:0, emoji:'🎓'}, 2), mk('n3', {type:'bday', name:'ひろし', m:3, d:3, y:0}, 3)); }""")
    page.evaluate("loadMessages(false)"); page.wait_for_timeout(900)
    r = page.evaluate("""() => [...document.querySelectorAll('#messages .bubble')].map(b => ({t:b.innerText.slice(0,40), ov: b.scrollWidth - b.clientWidth, r: b.getBoundingClientRect().right}))""")
    check("表示：新しい種類の吹き出しが画面の中に収まる", all(x["ov"] <= 2 and x["r"] <= 392 for x in r), r)
    check("表示：新しい種類の吹き出しが「未対応」の生テキストになっていない", not any(('"type"' in x["t"]) for x in r), r)
    page.screenshot(path="/home/claude/c12_mobile_chat.png")
    check("画面エラーなし", not errors(page, logs), errors(page, logs))
    browser.close()
if srv: srv.terminate()
print("合計 %d/%d" % (sum(res), len(res)))
