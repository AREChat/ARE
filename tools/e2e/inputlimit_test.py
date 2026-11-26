import sys, os, json, random
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
print("配信元:", SRC, "port", PORT)
EXTRA = open(HERE + "/chat_test.py", encoding="utf-8").read().split('EXTRA = """')[1].split('"""')[0]
rnd = lambda n: "".join(random.choice("あいうえおかきくけこ漢字テスト😀") for _ in range(n))
res = []
def check(name, ok, info=""):
    res.append(ok); print(("○ " if ok else "× ") + name + (" … " + str(info) if info != "" else ""))
def cnt(page): return page.evaluate("() => Array.from(document.getElementById('messageInput').value).length")
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=EXTRA)
    try: ctx.grant_permissions(["clipboard-read", "clipboard-write"])
    except Exception as e: print("clipboard権限なし", e)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1500)
    page.locator("#roomList button, #roomList .room, #roomList [data-room], #roomList > *").filter(has_text="みどり").first.click(); page.wait_for_timeout(1200)
    reset = lambda: (page.evaluate("() => { document.getElementById('messageInput').value=''; }"), page.focus("#messageInput"))
    # 1 まとめて入れる
    for n in (3999, 4000, 4001, 4100, 9000):
        reset(); page.keyboard.insert_text(rnd(n)); page.wait_for_timeout(200)
        check(f"まとめて{n}文字を入れる", cnt(page) == min(n, 4000), cnt(page))
    # 2 4000文字のとき、1文字打つ
    reset(); page.keyboard.insert_text(rnd(4000)); page.wait_for_timeout(100)
    page.keyboard.type("あ"); page.keyboard.type("A"); page.keyboard.press("Enter") if False else None
    check("4000文字のとき打っても増えない", cnt(page) == 4000, cnt(page))
    page.keyboard.press("Shift+Enter")
    check("4000文字のとき改行も入らない", cnt(page) == 4000, cnt(page))
    # 3 絵文字の境目
    reset(); page.keyboard.insert_text(rnd(3999)); page.keyboard.insert_text("😀😀😀")
    v = page.evaluate("() => document.getElementById('messageInput').value")
    check("3999文字に絵文字3つ→1つだけ入る(4000)", len(list(v)) == 4000 and v.endswith("😀"), len(list(v)))
    ok_pairs = page.evaluate("() => { const v=document.getElementById('messageInput').value; return !/[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])|(?<![\\uD800-\\uDBFF])[\\uDC00-\\uDFFF]/.test(v); }")
    check("絵文字が半分に割れていない", ok_pairs)
    # 4 選択して置きかえ
    reset(); page.keyboard.insert_text(rnd(4000))
    page.evaluate("() => { const e=document.getElementById('messageInput'); e.setSelectionRange(0,10); }")
    page.keyboard.insert_text("ん" * 30); page.wait_for_timeout(100)
    check("先頭10文字を選んで30文字を入れる→4000のまま", cnt(page) == 4000, cnt(page))
    page.evaluate("() => { const e=document.getElementById('messageInput'); e.setSelectionRange(0,10); }")
    page.keyboard.insert_text("ん" * 5); page.wait_for_timeout(100)
    check("10文字を選んで5文字を入れる→3995", cnt(page) == 3995, cnt(page))
    # 5 コピペ
    reset(); page.evaluate("(t) => navigator.clipboard.writeText(t)", rnd(6000))
    page.focus("#messageInput"); page.keyboard.press("Control+V"); page.wait_for_timeout(300)
    check("6000文字を貼り付け→4000", cnt(page) == 4000, cnt(page))
    page.keyboard.press("Control+V"); page.wait_for_timeout(300)
    check("もう一度貼り付けても4000のまま", cnt(page) == 4000, cnt(page))
    # 6 プログラム
    page.evaluate("() => { document.getElementById('messageInput').value = 'あ'.repeat(5000); }")
    check("プログラムが5000文字を書きこむ→4000", cnt(page) == 4000, cnt(page))
    page.evaluate("() => { const e=document.getElementById('messageInput'); e.value=''; e.value = e.value + '😀'.repeat(4500); }")
    check("絵文字4500個を書きこむ→4000", cnt(page) == 4000, cnt(page))
    # 7 変換中や別経路（元のsetterで直接入れて input を飛ばす）
    page.evaluate("""() => { const e=document.getElementById('messageInput');
      const d=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value'); d.set.call(e,'い'.repeat(4600));
      e.dispatchEvent(new Event('input',{bubbles:true})); }""")
    check("別経路で4600文字→inputで4000に切る", cnt(page) == 4000, cnt(page))
    page.evaluate("""() => { const e=document.getElementById('messageInput');
      const d=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value'); d.set.call(e,'う'.repeat(4300));
      e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'う'})); }""")
    check("変換確定で4300文字→4000に切る", cnt(page) == 4000, cnt(page))
    # 8 4000でちゃんと送れる
    reset(); page.keyboard.insert_text(rnd(4000)); page.evaluate("() => { window.__calls.length = 0; }")
    page.focus("#messageInput"); page.keyboard.press("Enter"); page.wait_for_timeout(1200)
    sent = page.evaluate("() => window.__calls.filter(c => c.rpc === 'send_message').map(c => { let t=''; try{ t = JSON.parse(c.args.p_content).text; }catch(e){}; return Array.from(t).length; })")
    check("4000文字ちょうどは送れる", sent == [4000], sent)
    # 9 数の表示
    reset(); page.keyboard.insert_text(rnd(5000)); page.wait_for_timeout(200)
    check("文字数の表示が 4000 になる", "4000" in page.inner_text("#charCount").replace(",", ""), page.inner_text("#charCount"))
    toast = page.evaluate("() => { const t = document.getElementById('toast'); return t && t.classList.contains('show') ? t.textContent : ''; }")
    check("あふれたときに注意が出る", "4,000" in toast, toast)
    # 10 直す欄
    reset(); page.keyboard.insert_text("テスト送信"); page.evaluate("() => { window.__calls.length = 0; }")
    page.keyboard.press("Enter"); page.wait_for_timeout(1000)
    opened = page.evaluate("""() => { const b=[...document.querySelectorAll('.bubble.mine, .message.mine .bubble, .msg.mine .bubble')].pop(); return !!b; }""")
    # 編集ボックスを直接作って試す
    page.evaluate("""() => { const t=document.createElement('textarea'); t.className='edit-box'; t.id='__eb'; t.value='あ'.repeat(3990); document.body.appendChild(t); t.focus(); }""")
    page.keyboard.insert_text("い" * 50); page.wait_for_timeout(100)
    n = page.evaluate("() => Array.from(document.getElementById('__eb').value).length")
    check("直す欄も4000まで", n == 4000, n)
    page.keyboard.type("う")
    n = page.evaluate("() => Array.from(document.getElementById('__eb').value).length")
    check("直す欄は4000で打っても増えない", n == 4000, n)
    errs = [l for l in logs if l[0] == "pageerror"]
    check("画面のエラーなし", not errs, errs[:3])
    browser.close()
print(f"結果: {sum(res)}/{len(res)} ○")
if srv: srv.terminate()
