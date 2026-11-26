import sys, json, re, time
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from game_pad_lib import *
exec(open(HERE + "/ec_ui_test.py").read().split("with sync_playwright() as p:")[0].split("ensure_game_server()")[1])
ensure_game_server()
with sync_playwright() as p:
    b, c, pg, logs, bad = mk(p, True, init=";localStorage.setItem('gk_echo',JSON.stringify({s1:3,s2:3,s3:3,s4:3,s5:3,s6:3,s7:3,s8:3,s9:3,s10:3,s11:3,s12:3,s13:3,s14:3}))")
    pg.goto(URL, wait_until="load"); pg.wait_for_timeout(500)
    pg.evaluate("()=>__ec.openLevel(14)"); pg.wait_for_timeout(300); solve_ui(pg, 14); pg.wait_for_timeout(900)
    check("T1 さいごの ステージ：「つぎへ」が かくれる", pg.evaluate("()=>document.getElementById('clNext').style.display") == "none")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(400); s = st(pg)
    check("T2 さいごの ステージで Enter → もういちど（同じ ステージ・やり直し）", s["idx"] == 14 and not s["modal"] and s["cur"] == "" and s["recs"] == [], s)
    solve_ui(pg, 14); pg.wait_for_timeout(900)
    pg.click("#clSel"); pg.wait_for_timeout(300); check("T3 「いちらん」で 一覧へ", st(pg)["scr"] == "sel", st(pg))
    pg.evaluate("()=>document.querySelectorAll('#levels .lv')[14].click()"); pg.wait_for_timeout(300)
    solve_ui(pg, 14); pg.wait_for_timeout(900); pg.click("#clRetry"); pg.wait_for_timeout(300); s = st(pg)
    check("T4 「もういちど」ボタン", s["idx"] == 14 and not s["modal"] and s["cur"] == "" and not s["won"], s)
    # 一覧から もどる ボタン（play 中の exit）はモーダルも 閉じる
    solve_ui(pg, 14); pg.wait_for_timeout(900); pg.evaluate("()=>document.getElementById('exitBtn').click()"); pg.wait_for_timeout(300); s = st(pg)   # ゲームパッドの B（onBack）は この道
    check("T5 クリア画面から「もどる」→ 一覧・モーダルが 残らない", s["scr"] == "sel" and not s["modal"], s)
    # 言語を かえた とき あそぶ画面の ボタン文字・バーが 変わる／ゲームは つづく
    pg.evaluate("()=>__ec.openLevel(6)"); pg.wait_for_timeout(200); keys(pg, "R"); pg.evaluate("()=>{localStorage.setItem('are_lang','en')}")
    pg.evaluate("()=>{__ec.show('play')}"); pg.wait_for_timeout(200)
    check("T6 あそんでいる最中でも show('play') で 手が きえない", st(pg)["cur"] == "R", st(pg))
    # 画面が かくれて もどる（visibilitychange）
    pg.evaluate("()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'))}"); pg.wait_for_timeout(200)
    keys(pg, "R"); check("T7 blur・focus のあとも そうさできる", st(pg)["cur"] == "RR" or st(pg)["cur"] == "RW", st(pg))
    # うごきの 最中に すぐ 次の 入力・リサイズ
    for i in range(10): pg.keyboard.press("ArrowDown"); pg.keyboard.press("ArrowUp")
    pg.set_viewport_size({"width": 500, "height": 400}); pg.wait_for_timeout(200); pg.set_viewport_size({"width": 420, "height": 820}); pg.wait_for_timeout(300)
    check("T8 れんだ中の リサイズでも エラーなし", not errs(logs), errs(logs)[:1])
    # マウスの クリック（スワイプなし）は 動かさない・右クリック／長おし
    cur0 = st(pg)["cur"]; box = pg.evaluate("()=>{const r=document.getElementById('cv').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}")
    pg.mouse.click(box[0], box[1]); pg.mouse.click(box[0], box[1], button="right"); pg.wait_for_timeout(200)
    check("T9 キャンバスを タップ・右クリックしても 動かない", st(pg)["cur"] == cur0, st(pg))
    # sound ボタン
    pg.click("#sndBtn"); a = pg.evaluate("()=>document.getElementById('sndBtn').textContent"); pg.click("#sndBtn"); bb = pg.evaluate("()=>document.getElementById('sndBtn').textContent")
    check("T10 音ボタンが 切りかわる", a != bb and {a, bb} == {"🔇", "🔊"}, (a, bb))
    # 手元の ヘルプ：ぜんぶの ことばに 「こだま」が 入っている（1つ ことばを ぬかさない）
    for lg, w in (("ja", "こだま"), ("en", "echo"), ("zh", "回声"), ("ko", "메아리")):
        pg.evaluate("(l)=>localStorage.setItem('are_lang',l)", lg); pg.reload(); pg.wait_for_timeout(300); pg.evaluate("()=>__ec.show('how')"); pg.wait_for_timeout(100)
        t = pg.evaluate("()=>document.getElementById('hBody').innerText")
        check("T11[%s] あそびかたに 「%s」と ⭐ の せつめい" % (lg, w), w in t.lower() and "⭐" in t and len(t) > 100, t[:40])
    check("T12 ページエラー・404 なし", not errs(logs) and not bad, (errs(logs)[:2], bad[:2]))
    b.close()
print("\nこだまの部屋 UIテスト3 %d / %d" % (sum(res), len(res))); sys.exit(0 if all(res) else 1)
