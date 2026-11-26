import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
exec(open("call_test.py").read().split("with sync_playwright() as p:")[0])
LONG = "あ" * 3000 + "終わり"
rows = [
 {"id":"s1","room_id":"r1","sender_id":"u-me","content":json.dumps({"type":"text","text":LONG}),"send_at":"2026-12-01T10:00:00Z","status":"pending","error":None},
 {"id":"s2","room_id":"r1","sender_id":"u-me","content":json.dumps({"type":"text","text":"短い予約"}),"send_at":"2026-12-01T11:00:00Z","status":"pending","error":None},
 {"id":"s3","room_id":"r1","sender_id":"u-me","content":json.dumps({"type":"text","text":"失敗した予約"}),"send_at":"2026-11-20T11:00:00Z","status":"failed","error":"blocked_by_filter"},
 {"id":"s4","room_id":"r1","sender_id":"u-me","content":json.dumps({"type":"image","name":"写真.png","url":"https://example.invalid/a.png","size":10}),"send_at":"2026-12-02T11:00:00Z","status":"pending","error":None},
]
extra = ("window.__fx.tables.scheduled_messages=" + json.dumps(rows) + ";window.__rp=[];"
         "window.__fx.rpc.update_scheduled_message=function(a){window.__rp.push(['update',a.p_id,a.p_content.length,a.p_send_at]);return null;};"
         "window.__fx.rpc.cancel_scheduled_message=function(a){window.__rp.push(['cancel',a.p_id]);return null;};")
def run(mobile):
    tag = "m" if mobile else "pc"
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx, pg, lg = mkpage(b, "u-me", extra, mobile=mobile)
        pg.goto(BASE + "/chat.html"); pg.wait_for_selector("#roomList"); pg.wait_for_timeout(1200)
        pg.click('[data-room-id="r1"]'); pg.wait_for_timeout(1500)
        pg.evaluate("()=>document.getElementById('scheduleButton').click()"); pg.wait_for_timeout(800)
        items = pg.evaluate("()=>[...document.querySelectorAll('#scheduleList .sched-item')].map(e=>e.innerText.replace(/\\n/g,' / ').slice(0,90))")
        check(tag + " 1 予約の一覧に 4件（待機3＋失敗1）が出る", len(items) == 4, items)
        check(tag + " 2 長い予約は「タップで全文」（3,003文字）。失敗した予約には 理由が出る", any("3003文字" in x for x in items) and any("送れませんでした" in x for x in items), items)
        pg.evaluate("()=>document.querySelector('#scheduleList details summary').click()"); pg.wait_for_timeout(200)
        check(tag + " 3 全文をひらくと、最後の「終わり」まで見える", pg.evaluate("()=>document.querySelector('.sched-fulltext').textContent.endsWith('終わり')"))
        pg.click('[data-edit="s1"]'); pg.wait_for_timeout(300)
        v = pg.evaluate("()=>[document.getElementById('schedEditText').value.length, document.getElementById('schedEditCount').textContent]")
        check(tag + " 4 「編集」を押すと その予約の文章が入った編集欄が出る", v == [3003, "3003"], v)
        pg.evaluate("()=>window.__fx && 0"); pg.evaluate("()=>loadScheduled()"); pg.wait_for_timeout(600)
        check(tag + " 5 8秒ごとの自動更新が走っても、直している途中の入力は消えない", pg.evaluate("()=>!!document.getElementById('schedEditText')"))
        pg.fill("#schedEditText", "あ" * 4000); pg.wait_for_timeout(200)
        pg.evaluate("()=>{const d=new Date(Date.now()+86400000*2);const p=n=>String(n).padStart(2,'0');document.getElementById('schedEditAt').value=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':00';}")
        pg.click('[data-edit-save="s1"]'); pg.wait_for_timeout(800)
        rp = pg.evaluate("()=>window.__rp")
        check(tag + " 6 4,000文字に直して保存できる（サーバーへ update が1回、中身は4,000文字の本文）", len(rp) == 1 and rp[0][0] == "update" and rp[0][1] == "s1" and rp[0][2] > 4000, rp)
        pg.evaluate("()=>{document.querySelector('[data-edit=\"s2\"]').click()}"); pg.wait_for_timeout(300)
        pg.evaluate("()=>{const t=document.getElementById('schedEditText');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'x'.repeat(4001));t.dispatchEvent(new Event('input'))}"); pg.wait_for_timeout(200)
        pg.click('[data-edit-save="s2"]'); pg.wait_for_timeout(500)
        rp2 = pg.evaluate("()=>window.__rp"); toast = pg.evaluate("()=>(document.getElementById('toast')||{}).textContent")
        check(tag + " 7 4,001文字は 保存できない（サーバーに送らず、案内が出る）", len(rp2) == 1 and "4,000" in (toast or ""), (rp2, toast))
        pg.click('[data-edit-cancel="1"]'); pg.wait_for_timeout(400)
        check(tag + " 8 「やめる」で一覧にもどる", pg.evaluate("()=>!document.getElementById('schedEditBox')"))
        pg.click('[data-edit="s4"]'); pg.wait_for_timeout(300)
        check(tag + " 9 写真の予約は 日時だけ直せる（文章欄は出ない）", pg.evaluate("()=>!document.getElementById('schedEditText') && !!document.getElementById('schedEditAt')"))
        pg.screenshot(path="/tmp/out/sched_%s.png" % tag)
        pg.click('[data-edit-cancel="1"]'); pg.wait_for_timeout(300)
        pg.click('[data-cancel="s3"]'); pg.wait_for_timeout(500)
        check(tag + " 10 失敗した予約も 取消できる", pg.evaluate("()=>window.__rp").__len__() == 2 and pg.evaluate("()=>window.__rp")[1] == ["cancel", "s3"])
        errs = [x for x in lg if x[0] == "pageerror"]
        check(tag + " 11 ページのエラーなし", not errs, errs[:2])
        b.close()
run(False); run(True)
print("\n予約の編集テスト %d / %d" % (sum(res), len(res))); sys.exit(0 if all(res) else 1)
