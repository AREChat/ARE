import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
exec(open("call_test.py").read().split("with sync_playwright() as p:")[0])
PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
def img(n): return json.dumps({"type":"image","name":"写真%d.png"%n,"url":"https://example.invalid/p%d.png"%n,"size":1234})
def msg(i, sender, t, content): return {"id":"m%d"%i,"room_id":"r1","sender_id":sender,"content":content,"created_at":t,"edited_at":None,"expires_at":None,"is_auto_reply":False}
msgs = [
 msg(1,"u1","2026-11-25T01:00:00Z","こんにちは"),
 msg(2,"u1","2026-11-25T01:00:10Z",img(1)), msg(3,"u1","2026-11-25T01:00:12Z",img(2)),     # ペア
 msg(4,"u1","2026-11-25T01:00:14Z",img(3)),                                                 # 3枚目：単独
 msg(5,"u-me","2026-11-25T01:05:00Z",img(4)), msg(6,"u-me","2026-11-25T01:05:02Z",img(5)), # 自分のペア
 msg(7,"u-me","2026-11-25T01:05:04Z",img(6)), msg(8,"u-me","2026-11-25T01:05:05Z",img(7)),  # もう1ペア
 msg(9,"u1","2026-11-25T01:10:00Z",img(8)), msg(10,"u-me","2026-11-25T01:10:01Z",img(9)),  # 送った人がちがう：まとめない
 msg(11,"u1","2026-11-25T01:20:00Z",img(10)), msg(12,"u1","2026-11-25T01:30:00Z",img(11)), # 時間がはなれている：まとめない
]
extra = "window.__fx.tables.messages=" + json.dumps(list(reversed(msgs))) + ";"
def run(mobile):
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx, pg, lg = mkpage(b, "u-me", extra, mobile=mobile); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
        pg.goto(BASE + "/chat.html"); pg.wait_for_selector("#roomList"); pg.wait_for_timeout(1500)
        pg.click('[data-room-id="r1"]'); pg.wait_for_timeout(1500)
        tag = "m" if mobile else "pc"
        info = pg.evaluate("""()=>({pairs:[...document.querySelectorAll('.photo-pair')].map(p=>[p.classList.contains('own'),[...p.querySelectorAll('.message-row')].map(r=>r.dataset.mid)]),
          singles:[...document.querySelectorAll('#messages > .message-row')].map(r=>r.dataset.mid)})""")
        print(tag, info)
        check("%s 1 同じ人が続けて送った写真は 2枚ずつ並ぶ（m2+m3、自分の m5+m6、m7+m8）" % tag, [p[1] for p in info["pairs"]] == [["m2","m3"],["m5","m6"],["m7","m8"]], info["pairs"])
        check("%s 2 自分のペアは 右よせ、相手のペアは 左よせ" % tag, [p[0] for p in info["pairs"]] == [False, True, True])
        check("%s 3 3枚目 m4 は ひとりで出る。送った人がちがう m9/m10、時間が離れた m11/m12 は まとめない" % tag, all(x in info["singles"] for x in ["m4","m9","m10","m11","m12"]), info["singles"])
        w = pg.evaluate("()=>{const p=document.querySelector('.photo-pair');const c=document.getElementById('messages');const r=p.getBoundingClientRect(),q=c.getBoundingClientRect();const rows=[...p.querySelectorAll('.message-row')].map(x=>x.getBoundingClientRect());return {inside:r.left>=q.left-1&&r.right<=q.right+1, sameRow:Math.abs(rows[0].top-rows[1].top)<4, side:rows[0].right<=rows[1].left+2}}")
        check("%s 4 2枚が 横にならび、画面からはみ出さない" % tag, w["inside"] and w["sameRow"] and w["side"], w)
        who = pg.evaluate("()=>document.querySelector('.photo-pair .pair-who').textContent")
        check("%s 5 ペアの上に 送った人の名前が出る" % tag, who == "みどり", who)
        # 操作：ペア内の写真にも メニュー・長押しが効く
        pg.evaluate("()=>document.querySelector('.photo-pair .message-row[data-mid=m3] img').scrollIntoView()")
        pg.screenshot(path="/tmp/out/pp_%s.png" % tag)
        check("%s 6 ページのエラーなし" % tag, not errs, errs[:3])
        b.close()
run(False); run(True)
print("\n写真ペアのテスト %d / %d" % (sum(res), len(res))); sys.exit(0 if all(res) else 1)
