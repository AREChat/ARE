import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
exec(open("call_test.py").read().split("with sync_playwright() as p:")[0])
extra = "window.__rp=[]; window.__fx.rpc.schedule_message=function(a){window.__rp.push({n:'schedule_message',len:a.p_content.length,txt:(JSON.parse(a.p_content).text||'').length});return 'sid1';};"
def run(mobile, label, text_js):
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx, pg, lg = mkpage(b, "u-me", extra, mobile=mobile)
        pg.goto(BASE + "/chat.html"); pg.wait_for_selector("#roomList"); pg.wait_for_timeout(1200)
        pg.click('[data-room-id="r1"]'); pg.wait_for_timeout(1200)
        print("btn", pg.evaluate("()=>{const b=document.getElementById(\"scheduleButton\");return [b.disabled,b.hidden,!!b.offsetParent]}")); pg.evaluate("()=>document.getElementById(\"scheduleButton\").click()"); pg.wait_for_timeout(400)
        pg.evaluate("()=>{const d=new Date(Date.now()+3600000+60000);const p=n=>String(n).padStart(2,'0');document.getElementById('scheduleAt').value=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());}")
        pg.evaluate("()=>{const m=document.getElementById('messageInput');m.disabled=false;}")
        pg.fill("#messageInput", text_js); pg.wait_for_timeout(300)
        cnt = pg.evaluate("()=>[document.getElementById('charCount').textContent, document.getElementById('messageInput').value.length, document.getElementById('scheduleSubmit').disabled]")
        pg.click("#scheduleSubmit"); pg.wait_for_timeout(800)
        rp = pg.evaluate("()=>window.__rp"); toast = pg.evaluate("()=>(document.getElementById('toast')||{}).textContent")
        errs = [x for x in lg if x[0]=="pageerror"]
        print(label, "mobile" if mobile else "pc", "count/len/disabled:", cnt, "rpc:", rp, "toast:", toast, "errs:", errs[:2])
        b.close()
for mobile in (False, True):
    run(mobile, "A あ×4000", "あ"*4000)
    run(mobile, "B 改行つき3999字", ("日本語の文章。\n"*500)[:3999])
    run(mobile, "C あ×4001", "あ"*4001)
