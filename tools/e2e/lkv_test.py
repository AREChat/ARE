import sys
sys.path.insert(0,__import__("os").path.dirname(__import__("os").path.abspath(__file__)))
exec(open("call_test.py").read().split("with sync_playwright() as p:")[0])
SEED = """
window.__fx.tables.messages = [
 {id:'m1', room_id:'r1', sender_id:'u1', content:'🎬 動画のリンク\\nsample.mp4\\nhttps://drive.google.com/file/d/ABCDEFGHIJ1234567/view', created_at:'2026-11-25T00:00:01Z', edited_at:null, expires_at:null, is_auto_reply:false},
 {id:'m2', room_id:'r1', sender_id:'u1', content:'見て https://youtu.be/dQw4w9WgXcQ', created_at:'2026-11-25T00:00:02Z', edited_at:null, expires_at:null, is_auto_reply:false},
 {id:'m3', room_id:'r1', sender_id:'u1', content:'https://example.com/a.mp4', created_at:'2026-11-25T00:00:03Z', edited_at:null, expires_at:null, is_auto_reply:false},
 {id:'m4', room_id:'r1', sender_id:'u1', content:'書類 https://drive.google.com/file/d/ZZZZZZZZZZ1234567/view', created_at:'2026-11-25T00:00:04Z', edited_at:null, expires_at:null, is_auto_reply:false},
 {id:'m5', room_id:'r1', sender_id:'u1', content:'https://x.supabase.co/storage/v1/object/public/b/clip.webm', created_at:'2026-11-25T00:00:05Z', edited_at:null, expires_at:null, is_auto_reply:false},
 {id:'m7', room_id:'r1', sender_id:'u1', content:'📎 ファイルのリンク\\n資料.pdf（2MB）\\nhttps://drive.google.com/file/d/FILEIDFILEID123456/view', created_at:'2026-11-25T00:00:07Z', edited_at:null, expires_at:null, is_auto_reply:false},
 {id:'m8', room_id:'r1', sender_id:'u1', content:'2本 https://youtu.be/dQw4w9WgXcQ https://youtu.be/aaaaaaaaaaa https://youtu.be/dQw4w9WgXcQ', created_at:'2026-11-25T00:00:08Z', edited_at:null, expires_at:null, is_auto_reply:false},
 {id:'m9', room_id:'r1', sender_id:'u1', content:'https://x.supabase.co/storage/v1/object/public/b/voice.mp3', created_at:'2026-11-25T00:00:09Z', edited_at:null, expires_at:null, is_auto_reply:false},
 {id:'m6', room_id:'r1', sender_id:'u1', content:'ふつうのリンク https://example.com/page', created_at:'2026-11-25T00:00:06Z', edited_at:null, expires_at:null, is_auto_reply:false}
];
"""
with sync_playwright() as p:
    browser = p.chromium.launch(args=ARGS)
    ctx, A, log = mkpage(browser, "u-me", extra=SEED); boot(A)
    A.wait_for_timeout(1500)
    n = A.evaluate("()=>document.querySelectorAll('#messages .lv-box').length")
    kinds = A.evaluate("()=>[...document.querySelectorAll('#messages .lv-box')].map(b=>JSON.parse(b.dataset.lv).k)")
    check("1 対象は 4 つ（ドライブ動画・webm・ファイル・音声。YouTube と知らないサイトの mp4 は対象外）", n == 4, (n, kinds))
    check("2 書類のドライブリンクと ふつうのリンクには出ない", A.evaluate("()=>[...document.querySelectorAll('#messages .bubble')].filter(b=>/書類|ふつうのリンク/.test(b.textContent)).every(b=>!b.querySelector('.lv-box'))"))
    g = A.evaluate("()=>[...document.querySelectorAll('#messages .lv-grid')].map(g=>g.dataset.n+':'+g.children.length)")
    check('2b YouTube のリンクにはプレビューを出さない', A.evaluate("()=>![...document.querySelectorAll('#messages .lv-box')].some(b=>/yt/.test(b.dataset.lv))"))
    check('2c ファイルのリンクの発言に プレビューの枠が出る', A.evaluate("()=>[...document.querySelectorAll('#messages .lv-box')].some(b=>JSON.parse(b.dataset.lv).k==='dfile')"))
    check('2d 音声のリンクにも枠が出る', A.evaluate("()=>[...document.querySelectorAll('#messages .lv-box')].some(b=>JSON.parse(b.dataset.lv).k==='audio')"))
    check("3 設定の項目がある（はじめは ON）", A.evaluate("()=>/ON/.test(document.getElementById('lkvSetItem').textContent)"))
    A.evaluate("()=>document.querySelectorAll('#messages .lv-box').forEach(b=>b.scrollIntoView())"); A.wait_for_timeout(1200)
    A.evaluate("()=>{const b=document.querySelector('#messages .lv-box');b.scrollIntoView({block:'center'});}"); A.wait_for_timeout(1500)
    info = A.evaluate("()=>[...document.querySelectorAll('#messages .lv-box')].map(b=>({on:b.dataset.on, v:!!b.querySelector('video'), f:!!b.querySelector('iframe'), src:(b.querySelector('video,iframe')||{}).src}))")
    print(info)
    check("4 見える位置にきたものが読みこまれる", any(i["on"]=="1" for i in info))
    # 全部を順にスクロール
    for i in range(4):
        A.evaluate("(i)=>{const b=document.querySelectorAll('#messages .lv-box')[i]; if(b) b.scrollIntoView({block:'center'});}", i); A.wait_for_timeout(900)
    info = A.evaluate("()=>[...document.querySelectorAll('#messages .lv-box')].map(b=>({on:b.dataset.on, v:!!b.querySelector('video'), f:!!b.querySelector('iframe'), src:(b.querySelector('video,iframe')||{}).src||''}))")
    print(info)
    dv = [i for i in info if "drive.google.com" in i["src"]]
    check("6 ドライブ動画・ファイルは読みこまれる（プレビュー画面）", len(dv)>=1, dv)
    mp = A.evaluate("()=>[...document.querySelectorAll('#messages .lv-video')].map(v=>({m:v.muted, ctl:v.controls, pi:v.playsInline, a:v.getAttribute('src')}))")
    check("7 動画は 操作つき・playsinline（枠があれば）", all(x["ctl"] and x["pi"] for x in mp), mp)
    check("7b ファイルのプレビューは ドライブの preview 画面", A.evaluate("()=>[...document.querySelectorAll('#messages .lv-doc iframe')].some(f=>f.src==='https://drive.google.com/file/d/FILEIDFILEID123456/preview')"))
    # 設定オフ → 自動再生しない
    A.evaluate("()=>document.getElementById('lkvFileItem').click()")
    check("7c ファイルのプレビューも 設定で OFF にできる", A.evaluate("()=>localStorage.getItem('are_lv_file')==='0' && window.ARElkv.kind('https://drive.google.com/file/d/ABCDEFGHIJ1234567/view','📎 ファイルのリンク')===null"))
    A.evaluate("()=>document.getElementById('lkvFileItem').click()")
    A.evaluate("()=>document.getElementById('lkvSetItem').click()")
    check("8 設定を押すとオフになり、保存される", A.evaluate("()=>localStorage.getItem('are_lv_auto')==='0' && /OFF/.test(document.getElementById('lkvSetItem').textContent)"))
    check("9 オフのとき ARElkv.auto() が false", A.evaluate("()=>window.ARElkv.auto()===false"))
    A.evaluate("()=>document.getElementById('lkvSetItem').click()")
    check("10 もう一度押すとオンに戻る", A.evaluate("()=>localStorage.getItem('are_lv_auto')==='1' && window.ARElkv.auto()===true"))
    # kind 判定
    t = A.evaluate("""()=>{const k=window.ARElkv.kind;return [
      k('https://youtube.com/watch?v=dQw4w9WgXcQ',''), k('https://evil.com/a.mp4',''),
      k('http://example.com/a.mp4',''), k('https://drive.google.com/file/d/ABCDEFGHIJ1234567/view','動画のリンク'), k('https://drive.google.com/file/d/ABCDEFGHIJ1234567/view','資料'),
      k('javascript:alert(1)','') ]}""")
    check("11 判定：youtube/shorts ○、知らないサイトの mp4 ×、http ×、ドライブは「動画のリンク」だけ ○、javascript: ×",
          t[0] is None and t[1] is None and t[2] is None and t[3] and t[4] is None and t[5] is None, t)
    errs = [l for l in log if l[0] in ("pageerror",)]
    check("12 画面のエラーが出ていない", not errs, errs[:3])
    browser.close()
print("\n動画リンクのテスト %d / %d" % (sum(res), len(res))); sys.exit(0 if all(res) else 1)
