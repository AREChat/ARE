from c12fx import *
srv = ensure_server()
import datetime, json
with sync_playwright() as p:
    browser, ctx, page, logs = open_chat(p)
    enter(page, "r3")
    toasts = "window.__toasts=[]; (function(){ const o=showToast; showToast=function(m){window.__toasts.push(m); return o.apply(this,arguments)} })();"
    page.evaluate(toasts)

    # ---- 4) おみくじ ----
    page.evaluate("openOmikuji()"); page.wait_for_timeout(300)
    check("おみくじ：最初は「引く」ボタン", page.locator("#profileSheet [data-t='om:draw']").count() == 1)
    click_t(page, "[data-t='om:draw']"); page.wait_for_timeout(300)
    t1 = sheet_text(page)
    check("おみくじ：結果（運勢・星・ラッキー・おすすめ）が出る", all(k in t1 for k in ["勉強・仕事", "人づきあい", "ラッキーカラー", "今日のおすすめ"]) and page.locator(".omi-level").count() == 1, t1[:200])
    lvl = page.inner_text(".omi-level")
    page.evaluate("closeSheet()"); page.evaluate("openOmikuji()"); page.wait_for_timeout(300)
    check("おみくじ：開きなおしても、同じ結果（その日は変わらない）", page.inner_text(".omi-level") == lvl)
    click_t(page, "[data-t='om:send']"); page.wait_for_timeout(600)
    msgs = page.evaluate("window.__fx.tables.messages.map(m=>JSON.parse(m.content))")
    check("おみくじ：チャットに送れる", any(m.get("type") == "text" and "今日のおみくじ" in m["text"] and ("運勢：" + lvl) in m["text"] for m in msgs))
    check("おみくじ：続けた日数が 1 日", "続けて引いた日数：1 日" in sheet_text(page) or "1</b> 日" in page.inner_html("#profileSheet"))
    stats = page.evaluate("""() => { const c = {}; let bad = 0; for(let i=0;i<4000;i++){ const o = omiRoll('user'+i, '2026-11-25'); c[o.level]=(c[o.level]||0)+1; if(!o.word||!o.color||!(o.num>=1&&o.num<=99)||o.stars.length!==4||o.stars.some(s=>s<1||s>5)) bad++; }
       const a = JSON.stringify(omiRoll('x','2026-01-01')), b = JSON.stringify(omiRoll('x','2026-01-01')), d = JSON.stringify(omiRoll('x','2026-01-02')); return {c, bad, same:a===b, diff:a!==d}; }""")
    check("おみくじ：4000人ぶんで 抜けなし・同じ人の同じ日は同じ・日が変われば変わる", stats["bad"] == 0 and stats["same"] and stats["diff"], stats)
    check("おみくじ：6種類すべて出て、大吉は約12%（8〜16%）・凶は約10%（7〜13%）", len(stats["c"]) == 6 and 0.08 <= stats["c"]["大吉"] / 4000 <= 0.16 and 0.07 <= stats["c"]["凶"] / 4000 <= 0.13, stats["c"])
    page.evaluate("closeSheet()")

    # ---- 6) ひとこと日記・ふりかえり ----
    page.evaluate("""() => { const d = n => { const x = new Date(); x.setDate(x.getDate()-n); return dayKey(x); };
      window.__fx.tables.user_diary = [ {day:d(1), mood:5, body:'ともだちと遊んだ'}, {day:d(2), mood:3, body:'ふつうの日'}, {day:d(7), mood:4, body:'1週間前の記録'}, {day:d(30), mood:2, body:'ひと月前の記録'}, {day:d(365), mood:5, body:'去年の今日'} ]; }""")
    page.evaluate("openOneLine()"); page.wait_for_selector("#olLine"); page.wait_for_timeout(600)
    txt = sheet_text(page)
    check("ふりかえり：1週間前・1か月前・1年前の今日が出る", "1週間前の今日" in txt and "1か月前の今日" in txt and "1年前の今日" in txt and "去年の今日" in txt, txt[:300])
    check("ふりかえり：続けて書いた日数（きのう・おととい＝2日）", "続けて書いた日数：2 日" in txt.replace("\n", ""), txt[:300])
    click_t(page, "[data-t='ol:range'][data-v='month']"); click_t(page, "[data-t='ol:range'][data-v='year']")
    check("ふりかえり：1か月・1年の切りかえ", "気分の平均" in sheet_text(page))
    click_t(page, "[data-t='ol:save']")
    check("ひとこと日記：何も入れずに保存は断る", any("書くか" in (t or "") for t in page.evaluate("window.__toasts")))
    click_t(page, "#olMoods [data-t='ol:mood'][data-m='4']"); page.fill("#olLine", "今日はよい天気"); click_t(page, "[data-t='ol:save']"); page.wait_for_timeout(700)
    row = [r for r in page.evaluate("window.__fx.tables.user_diary") if r["day"] == page.evaluate("dayKey(new Date())")]
    check("ひとこと日記：今日の行が保存される（気分4・本文）", row and row[0]["mood"] == 4 and row[0]["body"] == "今日はよい天気", row)
    page.fill("#olLine", "ゆうがたに さんぽ"); click_t(page, "[data-t='ol:save']"); page.wait_for_timeout(700)
    row = [r for r in page.evaluate("window.__fx.tables.user_diary") if r["day"] == page.evaluate("dayKey(new Date())")]
    check("ひとこと日記：同じ日の2回目は、あとに足される（上書きしない）", row and row[0]["body"] == "今日はよい天気\nゆうがたに さんぽ", row)
    check("ふりかえり：続けて書いた日数が 3 日に", "続けて書いた日数：3 日" in sheet_text(page).replace("\n", ""))
    page.evaluate("closeSheet()")

    # ---- 10) 誕生日 ----
    jr = page.evaluate("""() => { const t = new Date(); const mk = (n) => { const d = new Date(t.getFullYear(), t.getMonth(), t.getDate()+n); return {m:d.getMonth()+1, d:d.getDate(), y:2000}; };
       const a = bdNext(Object.assign({n:'a'}, mk(0))), b = bdNext(Object.assign({n:'b'}, mk(1))), c = bdNext(Object.assign({n:'c'}, mk(-1)));
       const leap = bdNext({n:'z', m:2, d:29, y:2000}); return {a:a.days, b:b.days, c:c.days, leapOk: leap.days >= 0 && leap.days <= 366, age:a.age, wk:dyWeek(new Date(2026,10,30)), wk2:dyWeek(new Date(2026,11,6)), wk3:dyWeek(new Date(2027,0,3)), wk4:dyWeek(new Date(2027,0,4))}; }""")
    check("誕生日：今日=0日・あした=1日・きのうは来年（364〜365日）・うるう日もエラーなし", jr["a"] == 0 and jr["b"] == 1 and jr["c"] in (364, 365) and jr["leapOk"], jr)
    check("週の目印：月曜はじまり（11/30(月)と12/6(日)は同じ週、1/3(日)と1/4(月)は別の週）", jr["wk"] == jr["wk2"] and jr["wk3"] != jr["wk4"], jr)
    page.evaluate("openBirthdays()"); page.wait_for_timeout(300)
    page.fill("#bdName", "<b>はなこ</b>"); page.select_option("#bdM", "2"); page.select_option("#bdD", "30"); click_t(page, "[data-t='bd:add']")
    check("誕生日：2月30日は断る", page.evaluate("bdList().length") == 0)
    today = datetime.date.today(); tomorrow = today + datetime.timedelta(days=1)
    page.fill("#bdName", "<b>はなこ</b>"); page.select_option("#bdM", str(tomorrow.month)); page.select_option("#bdD", str(tomorrow.day)); page.fill("#bdY", "2010"); click_t(page, "[data-t='bd:add']")
    check("誕生日：登録できる・名前のHTMLは文字のまま・あと1日", page.evaluate("bdList().length") == 1 and "&lt;b&gt;" not in sheet_text(page) and "<b>はなこ</b>" in sheet_text(page) and "あと 1 日" in sheet_text(page), sheet_text(page)[:300])
    check("誕生日：年を入れると「〇歳になる日」", "歳になる日" in sheet_text(page))
    page.fill("#bdName", "自分"); page.select_option("#bdM", "7"); page.select_option("#bdD", "7"); page.locator("#bdMe").check(); click_t(page, "[data-t='bd:add']")
    click_t(page, "[data-t='bd:sendme']"); page.wait_for_timeout(700)
    msgs = page.evaluate("window.__fx.tables.messages.map(m=>JSON.parse(m.content))")
    check("誕生日：自分の誕生日カードを送れる", any(m.get("type") == "bday" and m["name"] == "自分" and m["m"] == 7 and m["d"] == 7 for m in msgs))
    check("誕生日：カレンダーのマス（その月の誕生日に🎂）", page.locator(".bd-cell.bd-has").count() >= 1)
    # お祝い予約
    page.locator("#profileSheet [data-t='bd:wish']").first.click(); page.wait_for_timeout(300)
    check("誕生日：お祝い予約の欄が出る", page.locator("#bdWishText").count() == 1)
    page.select_option("#bdWishAt", "12"); click_t(page, "[data-t='bd:wishgo']"); page.wait_for_timeout(600)
    sm = page.evaluate("window.__fx.tables.scheduled_messages")
    ok = len(sm) == 1
    if ok:
        at = datetime.datetime.fromisoformat(sm[0]["send_at"].replace("Z", "+00:00")).astimezone()
        ok = at.date() == tomorrow and at.hour == 12 and json.loads(sm[0]["content"])["type"] == "text"
    check("誕生日：お祝いを あした12:00に予約（通常の予約送信）", ok, sm)
    page.evaluate("closeSheet()")
    # 受けとった誕生日カードの吹き出し
    page.evaluate("window.__fx.tables.messages.push({id:'bd1', room_id:'r3', sender_id:'u1', content:JSON.stringify({type:'bday', name:'みどり', m:12, d:25, y:2001}), created_at:new Date().toISOString(), edited_at:null, expires_at:null, is_auto_reply:false})")
    page.evaluate("loadMessages(false)"); page.wait_for_timeout(900)
    check("誕生日：受けとったカードに「カレンダーに入れる」", page.locator("[data-addbday]").count() >= 1)
    page.locator("[data-mid='bd1'] [data-addbday], [data-id='bd1'] [data-addbday]").first.click() if page.locator("[data-mid='bd1'] [data-addbday], [data-id='bd1'] [data-addbday]").count() else page.locator("[data-addbday][data-n='みどり']").first.click(); page.wait_for_timeout(300)
    check("誕生日：押すと自分のカレンダーに入る（12/25）", any(x["n"] == "みどり" and x["m"] == 12 and x["d"] == 25 for x in page.evaluate("bdList()")))
    page.locator("[data-addbday][data-n='みどり']").first.click(); page.wait_for_timeout(200)
    check("誕生日：2回押しても重複しない", len([x for x in page.evaluate("bdList()") if x["n"] == "みどり"]) == 1)
    # 開いたときのお知らせ（あした）
    page.evaluate("localStorage.removeItem(cfKey('bday')); cfWrite('bday', {list:[{id:'q1', n:'あした君', m:%d, d:%d, y:0}], shown:''}); dyStartup()" % (tomorrow.month, tomorrow.day)); page.wait_for_timeout(400)
    check("誕生日：開いたとき、あしたの誕生日をポップアップで知らせる", page.locator(".nf-pop").count() == 1 and "あした君" in page.inner_text(".nf-pop"), page.inner_text(".nf-pop") if page.locator(".nf-pop").count() else "なし")
    page.evaluate("dyStartup()"); page.wait_for_timeout(200)
    check("誕生日：同じ日に2回は出さない", page.evaluate("cfRead('bday',{}).shown") == page.evaluate("dayKey(new Date())"))
    page.evaluate("document.querySelectorAll('.nf-pop').forEach(n=>n.remove())")

    # ---- 9) 週刊ダイジェスト ----
    page.evaluate("""() => { const now = Date.now(); const rows = [];
      for(let i=0;i<30;i++){ rows.push({id:'g'+i, room_id: i%3 ? 'r1':'r3', sender_id: i%2 ? 'u-me':'u1', content:JSON.stringify({type:i%5?'text':'image', text:'x'}), created_at:new Date(now - i*5*3600*1000).toISOString(), deleted_at:null}); }
      rows.push({id:'old', room_id:'r1', sender_id:'u1', content:'{}', created_at:new Date(now - 10*86400000).toISOString(), deleted_at:null});
      window.__fx.tables.messages = window.__fx.tables.messages.concat(rows); }""")
    page.evaluate("openDigest()"); page.wait_for_selector(".dg-bars", timeout=8000); page.wait_for_timeout(300)
    txt = sheet_text(page)
    check("ダイジェスト：件数・よく話したチャット・時間帯・写真・日記が出る", all(k in txt for k in ["件", "よく話したチャット", "写真：送った", "ひとこと日記"]) , txt[:250])
    check("ダイジェスト：棒グラフ7本", page.locator(".dg-bars span").count() == 7)
    check("ダイジェスト：チャット名が出る（テスト班／みどり）", "テスト班" in txt or "みどり" in txt)
    page.locator("#profileSheet [data-t='dg:notify']").uncheck(); page.wait_for_timeout(200)
    check("ダイジェスト：お知らせを切れる", page.evaluate("cfRead('digest',{}).off") is True)
    click_t(page, "[data-t='dg:refresh']"); page.wait_for_selector(".dg-bars"); page.wait_for_timeout(200)
    page.evaluate("closeSheet()")

    # ---- 7) しずかモード ----
    q = page.evaluate("""() => { const mk = (d, h, m) => new Date(2026, 10, 25 + d, h, m); // 2026-11-25 は水曜
      const base = {on:true, from:'22:00', to:'07:00', days:[0,1,2,3,4,5,6], until:0};
      const out = {};
      out.night = quietIn(base, mk(0,23,0)); out.early = quietIn(base, mk(1,3,0)); out.noon = quietIn(base, mk(0,12,0)); out.edgeStart = quietIn(base, mk(0,22,0)); out.edgeEnd = quietIn(base, mk(1,7,0)); out.justBeforeEnd = quietIn(base, mk(1,6,59));
      const wk = Object.assign({}, base, {days:[1,2,3,4,5]});   // 月〜金の夜はじまり
      out.friNight = quietIn(wk, mk(2,23,0)); /* 11/27 金 */ out.satNight = quietIn(wk, mk(3,23,0)); /* 土 */ out.satEarly = quietIn(wk, mk(3,3,0)); /* 土の朝＝金の夜のつづき */ out.sunEarly = quietIn(wk, mk(4,3,0)); /* 日の朝＝土の夜のつづき → 土ははじまりでない */
      const day = {on:true, from:'09:00', to:'17:00', days:[3], until:0}; out.wedNoon = quietIn(day, mk(0,12,0)); out.thuNoon = quietIn(day, mk(1,12,0)); out.wedEvening = quietIn(day, mk(0,18,0));
      out.off = quietIn(Object.assign({}, base, {on:false}), mk(0,23,0)); out.same = quietIn(Object.assign({}, base, {from:'10:00', to:'10:00'}), mk(0,10,0));
      out.untilFuture = quietIn({on:false, from:'22:00', to:'07:00', days:[], until:mk(0,13,0).getTime()}, mk(0,12,0)); out.untilPast = quietIn({on:false, from:'22:00', to:'07:00', days:[], until:mk(0,11,0).getTime()}, mk(0,12,0));
      out.nodays = quietIn({on:true, from:'22:00', to:'07:00', days:[], until:0}, mk(0,23,0));
      return out; }""")
    exp = dict(night=True, early=True, noon=False, edgeStart=True, edgeEnd=False, justBeforeEnd=True, friNight=True, satNight=False, satEarly=True, sunEarly=False, wedNoon=True, thuNoon=False, wedEvening=False, off=False, same=False, untilFuture=True, untilPast=False, nodays=False)
    check("しずかモード：時間・曜日・日またぎ・境目の判定（18通り）", q == exp, {k: (q[k], exp[k]) for k in exp if q[k] != exp[k]})
    page.evaluate("openQuiet()"); page.wait_for_timeout(300)
    check("しずかモード：最初は「ふつうのモード」・バナーなし", "ふつうのモード" in sheet_text(page) and page.locator("#quietBar").count() == 0)
    click_t(page, "[data-t='qt:for'][data-h='1']"); page.wait_for_timeout(400)
    check("しずかモード：1時間だけ→バナーが出る", page.locator("#quietBar").count() == 1 and "しずかモード中" in page.inner_text("#quietBar") and page.evaluate("document.body.classList.contains('quiet-on')"))
    # 新着ポップアップが出ない・音が鳴らない
    page.evaluate("window.__pops=0; const o = nfPopup; ")
    page.evaluate("""() => { window.__sound = 0; const orig = alPlay; alPlay = function(){ window.__sound++; return orig.apply(this, arguments); }; }""")
    page.evaluate("nfPopup(state.rooms[0], {sender_id:'u1', content: JSON.stringify({type:'text', text:'こんにちは'}), created_at:new Date().toISOString()})"); page.wait_for_timeout(300)
    check("しずかモード：新着ポップアップが出ない", page.locator(".nf-pop").count() == 0)
    page.evaluate("alPlay('msg')")
    prefs = page.evaluate("""async () => { alSavePrefs(); await new Promise(r => setTimeout(r, 400)); const c = await caches.open('are-prefs'); const r = await c.match(new URL('are-prefs.json', location.href).href); return r ? await r.json() : null; }""")
    check("しずかモード：サービスワーカーに設定が渡る（quiet.until が未来）", prefs and prefs.get("quiet") and prefs["quiet"]["until"] > __import__("time").time() * 1000, prefs)
    click_t(page, "[data-t='qt:stop']"); page.wait_for_timeout(400)
    check("しずかモード：「今すぐ もどす」でバナーが消える", page.locator("#quietBar").count() == 0 and not page.evaluate("document.body.classList.contains('quiet-on')"))
    page.evaluate("nfPopup(state.rooms[0], {sender_id:'u1', content: JSON.stringify({type:'text', text:'こんにちは'}), created_at:new Date().toISOString()})"); page.wait_for_timeout(300)
    check("しずかモード：もどせば、ポップアップがまた出る", page.locator(".nf-pop").count() == 1)
    page.evaluate("document.querySelectorAll('.nf-pop').forEach(n=>n.remove())")
    # 予定つき：いまを含む時間にする
    now = datetime.datetime.now(); frm = (now - datetime.timedelta(hours=1)).strftime("%H:%M"); to = (now + datetime.timedelta(hours=1)).strftime("%H:%M")
    page.evaluate("openQuiet()"); page.wait_for_timeout(200)
    page.locator("#profileSheet [data-t='qt:on']").check(); page.wait_for_timeout(200)
    page.fill("#qtFrom", frm); page.dispatch_event("#qtFrom", "change"); page.fill("#qtTo", to); page.dispatch_event("#qtTo", "change"); page.wait_for_timeout(500)
    if frm < to:
        check("しずかモード：毎日の予定（いまを含む）でバナーが出る", page.locator("#quietBar").count() == 1)
        page.locator("#profileSheet [data-t='qt:day'][data-d='%d']" % ((now.weekday() + 1) % 7)).uncheck(); page.wait_for_timeout(500)
        check("しずかモード：今日の曜日のチェックを外すと、止まる", page.locator("#quietBar").count() == 0)
        page.locator("#profileSheet [data-t='qt:day'][data-d='%d']" % ((now.weekday() + 1) % 7)).check(); page.wait_for_timeout(500)
    page.locator("#profileSheet [data-t='qt:on']").uncheck(); page.wait_for_timeout(500)
    check("しずかモード：予定をオフにするとバナーが消える", page.locator("#quietBar").count() == 0)
    page.evaluate("closeSheet()")

    # ---- 11) やさしい表示 ----
    page.evaluate("window.__fx.tables.messages = window.__fx.tables.messages.filter(m => !/^(g\\d+|old)$/.test(m.id))")
    page.evaluate("window.__fx.tables.messages.sort((a,b)=> a.created_at < b.created_at ? 1 : -1)")   # 本物は order で新しい順に返る（テスト用の偽サーバーは並べかえないので先に並べる）
    page.evaluate("openEasy()"); page.wait_for_timeout(300)
    page.locator("#profileSheet [data-t='ez:on']").check(); page.wait_for_timeout(300)
    check("やさしい表示：オンで body に cf-easy・文字が大きい", page.evaluate("document.body.classList.contains('cf-easy')") and page.evaluate("parseFloat(getComputedStyle(document.querySelector('.bubble')||document.body).fontSize)") >= 18)
    check("やさしい表示：ボタンが大きい（高さ48px以上）", page.evaluate("[...document.querySelectorAll('#profileSheet button')].filter(b=>b.offsetParent).every(b=>b.getBoundingClientRect().height>=47)"))
    check("やさしい表示：設定が保存される", page.evaluate("cfRead('easy',{}).on") is True)
    page.evaluate("""() => { window.__said = []; const real = window.speechSynthesis; window.SpeechSynthesisUtterance = function(t){ this.text = t; }; Object.defineProperty(window, 'speechSynthesis', {value:{speak:(u)=>{ window.__said.push(u.text); }, cancel(){}, getVoices(){ return []; }}, configurable:true}); }""")
    page.locator("#profileSheet [data-t='ez:auto']").check(); page.wait_for_timeout(200)
    page.evaluate("closeSheet()")
    enter(page, "r3"); page.wait_for_timeout(600)
    page.evaluate("window.__said = []")
    page.evaluate("window.__fx.tables.messages.unshift({id:'in1', room_id:'r3', sender_id:'u1', content:JSON.stringify({type:'text', text:'あたらしい連絡です'}), created_at:new Date(Date.now()+600000).toISOString(), edited_at:null, expires_at:null, is_auto_reply:false})")
    page.evaluate("loadMessages(false)"); page.wait_for_timeout(1200)
    said = page.evaluate("window.__said")
    check("やさしい表示：新しいメッセージを自動で読み上げる（送り主つき）", any("あたらしい連絡です" in s and "みどり" in s for s in said), [said, page.evaluate("JSON.stringify([ez, easyCfg(), document.hidden, quietActive(), speakSupported(), state.messages.length, state.messages.map(m=>m.id), window.__fx.tables.messages.filter(m=>m.room_id==\"r3\").map(m=>m.id)])")])
    n0 = len(said)
    page.evaluate("loadMessages(false)"); page.wait_for_timeout(900)
    check("やさしい表示：同じメッセージを二度読まない", len(page.evaluate("window.__said")) == n0, [page.evaluate("window.__said"), n0, page.evaluate("JSON.stringify(ez)"), page.evaluate("state.messages.map(m=>m.id+'@'+m.created_at.slice(11,19))")])
    page.evaluate("window.__fx.tables.messages.unshift({id:'out1', room_id:'r3', sender_id:'u-me', content:JSON.stringify({type:'text', text:'じぶんの送信'}), created_at:new Date(Date.now()+700000).toISOString(), edited_at:null, expires_at:null, is_auto_reply:false})")
    page.evaluate("loadMessages(false)"); page.wait_for_timeout(900)
    check("やさしい表示：自分の送信は読まない", not any("じぶんの送信" in s for s in page.evaluate("window.__said")))
    enter(page, "r1"); page.wait_for_timeout(500); enter(page, "r3"); page.wait_for_timeout(700)
    check("やさしい表示：チャットを開いた直後は、古いメッセージを読み上げない", not any("あたらしい連絡です" in s for s in page.evaluate("window.__said")[n0:]), [page.evaluate("window.__said"), n0])
    page.evaluate("openEasy()"); page.wait_for_timeout(200)
    page.locator("#profileSheet [data-t='ez:on']").uncheck(); page.locator("#profileSheet [data-t='ez:auto']").uncheck(); page.wait_for_timeout(300)
    check("やさしい表示：オフにすると元の大きさ", not page.evaluate("document.body.classList.contains('cf-easy')"))
    page.evaluate("closeSheet()")
    print("画面エラー:", errors(page, logs))
    check("画面エラーなし", not errors(page, logs))
    browser.close()
if srv: srv.terminate()
print("合計 %d/%d" % (sum(res), len(res)))
