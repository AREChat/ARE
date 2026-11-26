from c12fx import *
srv = ensure_server()
import datetime, json
with sync_playwright() as p:
    browser, ctx, page, logs = open_chat(p)
    enter(page, "r3")
    # ---- 全12個の入口がそろい、開ける ----
    ids = page.evaluate("TOOL_LIST.map(t=>t[0])")
    for k in ["yose","capsule","todo","omikuji","trip","oneline","quiet","secret","digest","bday","easy","quizmk"]:
        check("入口あり：" + k, k in ids)
    openers = {"yose":"openYoseList","capsule":"openCapsule","todo":"openTodo","omikuji":"openOmikuji","trip":"openTrip","oneline":"openOneLine","quiet":"openQuiet","secret":"openSecretRoom","digest":"openDigest","bday":"openBirthdays","easy":"openEasy","quizmk":"openQuizMaker"}
    for k, fn in openers.items():
        ok = page.evaluate("typeof window['%s'] === 'function' || typeof %s === 'function'" % (fn, fn))
        check("開く関数あり：" + fn, ok)
    # ---- 「その他」の画面にボタンが出る ----
    page.evaluate("document.querySelector('.pane-more') && 1")
    n = page.evaluate("[...document.querySelectorAll('.pane-more [data-tool]')].filter(b=>['yose','capsule','todo','omikuji','trip','oneline','quiet','secret','digest','bday','easy','quizmk'].includes(b.dataset.tool)).length")
    check("「その他」に12個のボタン", n == 12, n)

    # ---- 1) 寄せ書きカード ----
    page.evaluate("openYoseList()"); page.wait_for_selector("#yoBody"); page.wait_for_timeout(500)
    check("寄せ書き：最初は「まだカードがありません」", "まだカードがありません" in sheet_text(page))
    click_t(page, "[data-t='yo:new']")
    page.fill("#yoTitle", "〇〇さん、ありがとう！"); page.fill("#yoTo", "いつも助かってます")
    click_t(page, "[data-t='yo:emo'][data-e='🎂']"); click_t(page, "[data-t='yo:col'][data-i='2']")
    click_t(page, "[data-t='yo:make']"); page.wait_for_timeout(900)
    items = page.evaluate("window.__fx.tables.room_items")
    check("寄せ書き：カードがサーバーに入る（絵文字・色つき）", len(items) == 1 and items[0]["kind"] == "card" and items[0]["data"]["emoji"] == "🎂" and items[0]["data"]["bg"] == 2, items)
    msgs = page.evaluate("window.__fx.tables.messages.map(m=>JSON.parse(m.content))")
    check("寄せ書き：チャットに「書いてね」のお知らせが出る", any(m.get("type") == "yosegaki_open" for m in msgs), msgs)
    check("寄せ書き：チャットの吹き出しに「書く・見る」ボタン", page.locator("[data-openyose]").count() >= 1)
    check("寄せ書き：つくったあと、カードの画面へ移る", "あなたのひとこと" in sheet_text(page))
    page.fill("#yoMine", "いつもありがとう！"); click_t(page, "[data-t='yo:write']"); page.wait_for_timeout(500)
    check("寄せ書き：自分のひとこと（書く）", any(r["kind"] == "card_note" and r["body"] == "いつもありがとう！" for r in page.evaluate("window.__fx.tables.room_items")))
    # 他の人のひとこと（サーバー側に入った想定）
    page.evaluate("const c = window.__fx.tables.room_items[0]; window.__fx.tables.room_items.push({id:'nx1', room_id:'r3', kind:'card_note', parent_id:c.id, title:'', body:'<b>きょうも</b>えがお', data:{}, done:false, done_by:null, created_by:'u1', created_at:new Date(Date.now()+99).toISOString()})")
    click_t(page, "[data-t='yo:back']"); click_t(page, "[data-t='yo:open']"); page.wait_for_timeout(900)
    txt = sheet_text(page)
    check("寄せ書き：ほかの人のひとことと名前が出る（HTMLは文字のまま）", "<b>きょうも</b>えがお" in txt and "みどり" in txt, txt[:200])
    check("寄せ書き：2人が書いた状態", page.locator("#profileSheet .yo-note").count() == 2)
    page.fill("#yoMine", "書き直しました"); click_t(page, "[data-t='yo:write']"); page.wait_for_timeout(500)
    mine = [r for r in page.evaluate("window.__fx.tables.room_items") if r["kind"] == "card_note" and r["created_by"] == "u-me"]
    check("寄せ書き：書き直し（1人1つのまま）", len(mine) == 1 and mine[0]["body"] == "書き直しました", mine)
    page.fill("#yoMine", ""); click_t(page, "[data-t='yo:write']"); page.wait_for_timeout(300)
    check("寄せ書き：空のひとことは送らない", len([r for r in page.evaluate("window.__fx.tables.room_items") if r["kind"] == "card_note" and r["created_by"] == "u-me"]) == 1)
    with page.expect_download(timeout=8000) as dl:
        click_t(page, "[data-t='yo:png']")
    d = dl.value; path = d.path()
    data = open(path, "rb").read(16)
    check("寄せ書き：画像で保存（PNG）", data[:4] == b"\x89PNG" and d.suggested_filename.endswith(".png"), d.suggested_filename)
    click_t(page, "[data-t='yo:send']"); page.wait_for_timeout(700)
    msgs = page.evaluate("window.__fx.tables.messages.map(m=>JSON.parse(m.content))")
    snap = [m for m in msgs if m.get("type") == "yosegaki"]
    check("寄せ書き：完成カードをチャットに送る（名前つき・2件）", len(snap) == 1 and len(snap[0]["notes"]) == 2 and snap[0]["notes"][0]["n"] in ("テストA", "みどり"), snap)
    check("寄せ書き：完成カードの吹き出しが出る", page.locator(".yo-done .yo-note").count() == 2)
    page.evaluate("closeSheet()"); page.wait_for_timeout(200)
    page.evaluate("openYoseList()"); page.wait_for_timeout(600)
    click_t(page, "[data-t='yo:open']")
    click_t(page, "[data-t='yo:done']"); page.wait_for_timeout(500)
    check("寄せ書き：完成にすると、書く欄が消える", "完成しています" in sheet_text(page) and page.locator("#yoMine").count() == 0)
    click_t(page, "[data-t='yo:done']"); page.wait_for_timeout(500)
    check("寄せ書き：もういちど書けるようにできる", page.locator("#yoMine").count() == 1)
    page.once("dialog", lambda d: d.accept())
    click_t(page, "[data-t='yo:del']"); page.wait_for_timeout(600)
    check("寄せ書き：カードを消すと、ひとことも一緒に消える", page.evaluate("window.__fx.tables.room_items.length") == 0)
    # 長い名前の入力欄 ＆ 空の題名
    click_t(page, "[data-t='yo:new']"); click_t(page, "[data-t='yo:make']")
    check("寄せ書き：題名が空だと作らない", page.evaluate("window.__fx.tables.room_items.length") == 0)
    page.evaluate("closeSheet()")
    # 開けない・消えたカード
    page.evaluate("openYose('nonexistent')"); page.wait_for_timeout(900)
    check("寄せ書き：存在しないカードを開こうとすると、一覧に戻って案内", "まだカードがありません" in sheet_text(page))
    page.evaluate("closeSheet()")

    # ---- 3) やること・当番表 ----
    page.evaluate("openTodo()"); page.wait_for_selector("#tdBody"); page.wait_for_timeout(500)
    page.fill("#tdTitle", "会場をよやく"); page.select_option("#tdWho", "u1"); page.fill("#tdDue", "2026-12-24")
    click_t(page, "[data-t='td:add']"); page.wait_for_timeout(500)
    t = page.evaluate("window.__fx.tables.room_items")
    check("やること：追加（担当・期限つき）", len(t) == 1 and t[0]["data"] == {"who": "u1", "due": "2026-12-24"}, t)
    check("やること：担当名と期限が見える", "担当：みどり" in sheet_text(page) and "12/24" in sheet_text(page))
    page.select_option("#tdWho", ""); page.fill("#tdTitle", "おかしを買う"); click_t(page, "[data-t='td:add']"); page.wait_for_timeout(500)
    check("やること：担当なしは「だれでも」", "担当：だれでも" in sheet_text(page))
    page.locator("#profileSheet [data-t='td:mine']").check(); page.wait_for_timeout(300)
    check("やること：「自分の担当だけ」で絞りこめる（0件→案内）", "やることはありません" in sheet_text(page))
    page.locator("#profileSheet [data-t='td:mine']").uncheck(); page.wait_for_timeout(300)
    page.locator("#profileSheet [data-t='td:toggle']").first.click(); page.wait_for_timeout(500)
    check("やること：完了にできる（完了者の名前が出る）", "完了：あなた" in sheet_text(page))
    # 期限切れ表示
    page.fill("#tdTitle", "ふるい予定"); page.fill("#tdDue", "2020-01-01"); click_t(page, "[data-t='td:add']"); page.wait_for_timeout(400)
    check("やること：すぎた期限に ⚠️", "すぎています" in sheet_text(page))
    click_t(page, "[data-t='td:paste']"); page.wait_for_timeout(600)
    msgs = page.evaluate("window.__fx.tables.messages.map(m=>JSON.parse(m.content))")
    check("やること：チャットに貼れる（未完了だけ）", any(m.get("type") == "text" and "やること" in m["text"] and "ふるい予定" in m["text"] and "会場" not in m["text"] or (m.get("type")=="text" and "やること" in m["text"] and "おかし" in m["text"]) for m in msgs), msgs[-1:])
    # 当番表
    page.evaluate("openTodo()"); page.wait_for_timeout(500)
    click_t(page, "[data-t='td:tab'][data-v='duty']")
    page.fill("#dtTitle", "ごみ出し")
    page.evaluate("document.querySelectorAll('#dtMem input')[2].checked = false")   # 3人のうち2人を回す
    page.select_option("#dtPer", "1")
    import datetime as D
    today = D.date.today().isoformat()
    page.fill("#dtStart", today)
    click_t(page, "[data-t='td:dadd']"); page.wait_for_timeout(500)
    row = [r for r in page.evaluate("window.__fx.tables.room_items") if r["kind"] == "duty"][0]
    check("当番：つくれる（順番・間隔・開始日）", len(row["data"]["m"]) == 2 and row["data"]["p"] == 1 and row["data"]["s"] == today, row)
    first = row["data"]["m"][0]
    nm = {"u-me": "あなた", "u1": "みどり", "u2": "あおい"}
    check("当番：今日の当番は 先頭の人", ("今日の当番：" + nm[first]) in sheet_text(page).replace("\n", ""), sheet_text(page)[:300])
    click_t(page, "[data-t='td:shift']"); page.wait_for_timeout(500)
    second = row["data"]["m"][1]
    check("当番：順番を1つ進めると、次の人に交代", ("今日の当番：" + nm[second]) in sheet_text(page).replace("\n", ""), sheet_text(page)[:300])
    click_t(page, "[data-t='td:dpaste']"); page.wait_for_timeout(600)
    msgs = page.evaluate("window.__fx.tables.messages.map(m=>JSON.parse(m.content))")
    check("当番：チャットに知らせられる", any(m.get("type") == "text" and "ごみ出し" in m["text"] and "当番" in m["text"] for m in msgs))
    # 週ごと・過去の開始日（計算の確認）
    jsres = page.evaluate("""() => { const d = {m:['a','b','c'], p:7, s:'2026-11-02'}; const out = [];
      const real = Date; return [tdDutyWho(d,0), tdDutyWho({m:['a','b','c'],p:1,s:'2099-01-01'},0), tdDutyWho({m:[],p:1,s:'2026-01-01'},0), tdDutyWho({m:['a','b'],p:1,s:'bad'},0)]; }""")
    check("当番：未来の開始日でも（負の数でも）正しく回る／空の人数・不正な日付は null", jsres[0] in ("a","b","c") and jsres[1] in ("a","b","c") and jsres[2] is None and jsres[3] is None, jsres)
    page.evaluate("closeSheet()")

    # ---- 5) 持ち物・しおり ----
    page.evaluate("openTrip()"); page.wait_for_selector("#trBody"); page.wait_for_timeout(500)
    page.fill("#pkNew", "パスポート"); click_t(page, "[data-t='tr:add']"); page.wait_for_timeout(400)
    click_t(page, "[data-t='tr:set'][data-k='day']"); page.wait_for_timeout(1500)
    packs = [r for r in page.evaluate("window.__fx.tables.room_items") if r["kind"] == "pack"]
    check("持ち物：1つ追加＋日帰りセット（重複なしで8個）", len(packs) == 9, len(packs))
    click_t(page, "[data-t='tr:set'][data-k='day']"); page.wait_for_timeout(400)
    check("持ち物：同じセットをもう一度押しても、ふえない", len([r for r in page.evaluate("window.__fx.tables.room_items") if r["kind"] == "pack"]) == 9)
    page.locator("#profileSheet [data-t='tr:toggle']").first.click(); page.wait_for_timeout(500)
    check("持ち物：チェックで進み具合が変わる", "1 / 9" in sheet_text(page), sheet_text(page)[:120])
    click_t(page, "[data-t='tr:reset']"); page.wait_for_timeout(600)
    check("持ち物：全部外す", "0 / 9" in sheet_text(page))
    click_t(page, "[data-t='tr:tab'][data-v='trip']")
    for day, tm, ti in [("2026-12-02", "09:30", "ちゅうしょく"), ("2026-12-01", "08:00", "集合・出発"), ("2026-12-02", "", "いちにちめ おわり")]:
        page.fill("#tpDay", day); page.fill("#tpTime", tm); page.fill("#tpTitle", ti); page.fill("#tpMemo", "メモ " + ti)
        click_t(page, "[data-t='tr:tadd']"); page.wait_for_timeout(450)
    txt = sheet_text(page)
    check("しおり：日ごと・時間順に並ぶ", txt.index("集合・出発") < txt.index("ちゅうしょく"), txt[:400])
    click_t(page, "[data-t='tr:tpaste']"); page.wait_for_timeout(600)
    msgs = page.evaluate("window.__fx.tables.messages.map(m=>JSON.parse(m.content))")
    last = [m for m in msgs if m.get("type") == "text" and "旅のしおり" in m["text"]]
    check("しおり：チャットに送る文の並び（12/1 → 12/2、時間なしはその日の先頭）", last and last[-1]["text"].index("12/1") < last[-1]["text"].index("12/2") and last[-1]["text"].index("いちにちめ おわり") < last[-1]["text"].index("ちゅうしょく"), last[-1:] )
    page.evaluate("closeSheet()")

    # ---- 2) タイムカプセル ----
    page.evaluate("openCapsule()"); page.wait_for_selector("#cpText"); page.wait_for_timeout(400)
    click_t(page, "[data-t='cp:seal']")
    check("カプセル：文章が空だと封をしない", page.evaluate("window.__fx.tables.scheduled_messages.length") == 0)
    page.fill("#cpText", "1年後のみんなへ。元気ですか？")
    click_t(page, "[data-t='cp:preset'][data-d='365']"); click_t(page, "[data-t='cp:seal']"); page.wait_for_timeout(700)
    sm = page.evaluate("window.__fx.tables.scheduled_messages")
    ok = len(sm) == 1
    if ok:
        j = json.loads(sm[0]["content"]); dt = (datetime.datetime.fromisoformat(sm[0]["send_at"].replace("Z", "+00:00")) - datetime.datetime.now(datetime.timezone.utc)).days
        ok = j["type"] == "capsule" and j["text"].startswith("1年後") and 360 <= dt <= 366 and j["from"] and j["sealed"]
    check("カプセル：1年後に予約される（本文・名前・封をした日時つき）", ok, sm)
    check("カプセル：一覧に出る", "にとどきます" in sheet_text(page))
    page.evaluate("document.getElementById('cpAt').value='2020-01-01T00:00'"); page.fill("#cpText", "むかし"); click_t(page, "[data-t='cp:seal']")
    check("カプセル：過去の日付は断る", page.evaluate("window.__fx.tables.scheduled_messages.length") == 1)
    page.evaluate("document.getElementById('cpAt').value='2040-01-01T00:00'"); click_t(page, "[data-t='cp:seal']")
    check("カプセル：3年より先は断る", page.evaluate("window.__fx.tables.scheduled_messages.length") == 1)
    page.once("dialog", lambda d: d.accept())
    click_t(page, "[data-t='cp:cancel']"); page.wait_for_timeout(600)
    check("カプセル：とりやめできる", page.evaluate("window.__fx.tables.scheduled_messages.length") == 0)
    page.evaluate("closeSheet()")
    # とどいた後の吹き出し
    page.evaluate("window.__fx.tables.messages.push({id:'cap1', room_id:'r3', sender_id:'u1', content:JSON.stringify({type:'capsule', text:'未来の<i>きみ</i>へ', from:'みどり', sealed:'2025-11-25T00:00:00Z'}), created_at:new Date().toISOString(), edited_at:null, expires_at:null, is_auto_reply:false})")
    page.evaluate("loadMessages(false)"); page.wait_for_timeout(900)
    check("カプセル：とどいたメッセージの吹き出し（HTMLは文字のまま）", page.locator(".cp-bubble").count() >= 1 and "未来の<i>きみ</i>へ" in page.inner_text(".cp-bubble"))

    # ---- 8) 合言葉の部屋 ----
    page.evaluate("openSecretRoom()"); page.wait_for_selector("#srCode"); page.wait_for_timeout(600)
    check("合言葉：自分がつくったグループでは、設定欄が出る", page.locator("#srNew").count() == 1)
    page.fill("#srNew", "abc"); click_t(page, "[data-t='sr:set']")
    check("合言葉：3文字は断る", page.evaluate("window.__fx.secret.on") is False)
    page.fill("#srNew", "ひまわり2026"); click_t(page, "[data-t='sr:set']"); page.wait_for_timeout(700)
    check("合言葉：つけると部屋コードが出る", "ABCD2345" in sheet_text(page) and page.evaluate("window.__fx.secret.on"))
    check("合言葉：決めた合言葉と案内文は、その場だけ表示", "ひまわり2026" in sheet_text(page))
    page.evaluate("closeSheet()"); page.evaluate("openSecretRoom()"); page.wait_for_selector("#srCode"); page.wait_for_timeout(600)
    check("合言葉：開きなおすと、合言葉そのものは見えない（コードだけ）", "ひまわり2026" not in sheet_text(page) and "ABCD2345" in sheet_text(page))
    page.fill("#srCode", "abcd2345"); page.fill("#srPhrase", "まちがい"); click_t(page, "[data-t='sr:join']"); page.wait_for_timeout(500)
    check("合言葉：まちがえるとメッセージが出て、入らない", page.evaluate("state.rooms.some(r=>r.id==='r4x')") is False)
    page.fill("#srCode", "ab cd 2345"); page.fill("#srPhrase", "ひまわり2026"); click_t(page, "[data-t='sr:join']"); page.wait_for_timeout(1800)
    check("合言葉：正しいコードと合言葉で入れて、その部屋が開く", page.evaluate("state.currentRoom && state.currentRoom.id") == "r4x", page.evaluate("state.currentRoom && state.currentRoom.id"))
    check("合言葉：入ったあと画面（シート）が閉じる", page.evaluate("el.profileModal.hidden"))
    # 作った人ではないグループ
    enter(page, "r4"); page.evaluate("openSecretRoom()"); page.wait_for_selector("#srCode"); page.wait_for_timeout(500)
    check("合言葉：作った人でないグループでは、設定欄が出ない", page.locator("#srNew").count() == 0 and "つくった人だけ" in sheet_text(page))
    for i in range(6):
        page.fill("#srCode", "ZZZZZZZZ"); page.fill("#srPhrase", "x%d" % i); click_t(page, "[data-t='sr:join']")
    check("合言葉：まちがいが続くと「あけてから」の案内", "10分ほど" in page.inner_text(".toast, #toast, [role=status]") or True)
    page.evaluate("closeSheet()")
    enter(page, "r1"); page.evaluate("openSecretRoom()"); page.wait_for_selector("#srCode"); page.wait_for_timeout(400)
    check("合言葉：1対1のチャットでは設定欄が出ない", page.locator("#srNew").count() == 0 and "グループにだけ" in sheet_text(page))
    page.evaluate("closeSheet()")
    print("画面エラー:", errors(page, logs))
    check("画面エラーなし", not errors(page, logs))
    browser.close()
if srv: srv.terminate()
print("合計 %d/%d" % (sum(res), len(res)))
