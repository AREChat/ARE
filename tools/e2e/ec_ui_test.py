import sys, json, re, time
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from game_pad_lib import *
ensure_game_server()
res = []
def check(n, ok, d=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(d)[:240]) if d != "" else ""), flush=True)
URL = GBASE + "/game11/echo.html"
LV = json.loads(re.search(r"window.EC_LEVELS = (\[.*\]);", open("/home/claude/r3/game/game11/js/ec-levels.js", encoding="utf-8").read(), re.S).group(1))
KEY = {"U": "ArrowUp", "D": "ArrowDown", "L": "ArrowLeft", "R": "ArrowRight", "W": "x"}
def E(pg, js, arg=None): return pg.evaluate(js, arg) if arg is not None else pg.evaluate(js)
def st(pg): return E(pg, "()=>{const S=__ec.S;return {scr:S.scr,idx:S.idx,cur:S.G&&S.G.cur,recs:S.G&&S.G.recs.slice(),won:S.won,modal:document.getElementById('mClear').classList.contains('on'),msg:document.getElementById('msg').textContent,msgOn:document.getElementById('msg').classList.contains('on')}}")
def keys(pg, s, d=60):
    for ch in s: pg.keyboard.press(KEY[ch]); pg.wait_for_timeout(d)
def mk(p, mobile, w=None, h=None, init=""):
    b, c, pg, logs = new_game_page(p, w or (420 if mobile else 1000), h or (820 if mobile else 700), mobile)
    c.add_init_script("try{localStorage.setItem('are_gtips_off','1')}catch(e){}" + init)
    bad = []
    pg.on("response", lambda r: bad.append("%d %s" % (r.status, r.url.replace(GBASE, ""))) if r.url.startswith(GBASE) and r.status >= 400 and "version.json" not in r.url else None)
    return b, c, pg, logs, bad
def solve_ui(pg, idx):
    """こたえを 画面の そうさ（キーボード）で たどる"""
    sol = LV[idx]["sol"]
    for i, r in enumerate(sol):
        keys(pg, r)
        if i < len(sol) - 1:
            pg.keyboard.press("Enter"); pg.wait_for_timeout(80)
def errs(logs): return [l for l in logs if l[0] == "pageerror"]
with sync_playwright() as p:
    for mobile in (True, False):
        tag = "スマホ" if mobile else "PC"
        b, c, pg, logs, bad = mk(p, mobile)
        pg.goto(URL, wait_until="load"); pg.wait_for_timeout(700)
        check(tag + " 1 タイトルが出る・ステージ数が 表示に 入っている", E(pg, "()=>document.getElementById('s-title').classList.contains('on')") and str(len(LV)) in E(pg, "()=>document.getElementById('tNote').textContent"), E(pg, "()=>document.getElementById('tNote').textContent"))
        # --- 4か国語：すべての 画面で undefined / {…} が 出ない・はみ出さない ---
        for lg in ("ja", "en", "zh", "ko"):
            pg.evaluate("(l)=>{localStorage.setItem('are_lang', l)}", lg); pg.reload(); pg.wait_for_timeout(500)
            bad_txt = []
            for scr in ("title", "how", "sel", "play"):
                if scr == "play": pg.evaluate("()=>__ec.openLevel(0)")
                else: pg.evaluate("(s)=>__ec.show(s)", scr)
                pg.wait_for_timeout(200)
                txt = pg.evaluate("()=>document.body.innerText")
                if re.search(r"undefined|NaN|\{[a-z]\}|\[object", txt): bad_txt.append((scr, re.findall(r"undefined|NaN|\{[a-z]\}|\[object", txt)))
                ov = pg.evaluate("()=>[...document.querySelectorAll('button,.pill,h2,.panel')].filter(e=>e.offsetParent&&(e.scrollWidth>e.clientWidth+2)).map(e=>(e.id||e.className||e.tagName)+':'+e.scrollWidth+'/'+e.clientWidth)")
                if ov: bad_txt.append((scr, "はみ出し", ov[:3]))
                hs = pg.evaluate("()=>document.documentElement.scrollWidth-innerWidth")
                if hs > 1: bad_txt.append((scr, "横スクロール", hs))
            check(tag + " 2[%s] 4画面とも 文字の ぬけ・はみ出し・横スクロールなし" % lg, not bad_txt, bad_txt)
            check(tag + " 2[%s] html lang が 合う" % lg, pg.evaluate("()=>document.documentElement.lang") == lg)
        pg.evaluate("()=>localStorage.setItem('are_lang','ja')"); pg.reload(); pg.wait_for_timeout(400)
        # --- 言語ボタン ---
        seen = []
        for i in range(5):
            seen.append(pg.evaluate("()=>document.getElementById('lgBtn').textContent")); pg.click("#lgBtn"); pg.wait_for_timeout(120)
        check(tag + " 3 言語ボタンで ja→en→zh→ko→ja", seen == ["日本語", "English", "中文", "한국어", "日本語"], seen)
        check(tag + " 4 言語は 保存される", E(pg, "()=>localStorage.getItem('are_lang')") == "en", E(pg, "()=>localStorage.getItem('are_lang')"))
        pg.evaluate("()=>localStorage.setItem('are_lang','ja')"); pg.reload(); pg.wait_for_timeout(400)
        # --- ステージ一覧・ロック ---
        pg.click("#bStages"); pg.wait_for_timeout(200)
        lock = pg.evaluate("()=>[...document.querySelectorAll('#levels .lv')].map(b=>b.classList.contains('lock'))")
        check(tag + " 5 はじめは ステージ1 だけ あいている", lock == [False] + [True] * (len(LV) - 1), lock)
        pg.evaluate("()=>document.querySelectorAll('#levels .lv')[5].click()"); pg.wait_for_timeout(200)
        check(tag + " 6 ロック中を おしても はじまらない", st(pg)["scr"] == "sel")
        pg.evaluate("()=>document.querySelector('#levels .lv').click()"); pg.wait_for_timeout(300)
        s0 = st(pg); check(tag + " 7 ステージ1が はじまる", s0["scr"] == "play" and s0["idx"] == 0 and s0["cur"] == "" and s0["msgOn"], s0)
        # --- 画面ボタンで あそぶ ---
        pg.evaluate("()=>document.querySelector('#dpad .d').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))"); pg.wait_for_timeout(120)
        check(tag + " 8 ▼ボタンで 1手", st(pg)["cur"] == "D", st(pg))
        pg.evaluate("()=>document.querySelector('#dpad .u').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))"); pg.wait_for_timeout(120)
        pg.evaluate("()=>document.querySelector('#dpad .l').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))"); pg.wait_for_timeout(300)
        s1 = st(pg); check(tag + " 9 かべに ぶつかると「まつ」になり、メッセージが 出る", s1["cur"] == "DUW" or s1["cur"] == "DUW", s1)
        pg.screenshot(path="/tmp/out/ec_blocked_%s.png" % tag)
        # 戻す／このラウンドやりなおし
        pg.click("#bUndo"); pg.wait_for_timeout(100); check(tag + " 10 もどす（1手）", st(pg)["cur"] == "DU", st(pg))
        pg.click("#bRound"); pg.wait_for_timeout(100); check(tag + " 11 このラウンドを やりなおす", st(pg)["cur"] == "")
        check(tag + " 12 なにも してない時は もどす・やりなおし・さいしょから が おせない", E(pg, "()=>['bUndo','bRound','bReset','bEcho'].map(i=>document.getElementById(i).disabled)") == [True, True, True, True])
        # こたえを たどる
        solve_ui(pg, 0); pg.wait_for_timeout(900)
        s2 = st(pg); check(tag + " 13 キーボードで こたえ通りに クリア", s2["won"] and s2["modal"], s2)
        pg.screenshot(path="/tmp/out/ec_clear_%s.png" % tag)
        check(tag + " 14 星が 3つ ほぞん", E(pg, "()=>JSON.parse(localStorage.getItem('gk_echo')).s1") == 3, E(pg, "()=>localStorage.getItem('gk_echo')"))
        before = st(pg)["cur"]; keys(pg, "RR"); pg.wait_for_timeout(100)
        check(tag + " 15 クリア後は 動かない", st(pg)["cur"] == before)
        pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
        s3 = st(pg); check(tag + " 16 Enter で つぎへ（1回で 1つだけ すすむ）", s3["idx"] == 1 and not s3["modal"], s3)
        # ひとつ すすむと 3 も あく
        pg.evaluate("()=>__ec.show('sel')"); pg.wait_for_timeout(150)
        lock = pg.evaluate("()=>[...document.querySelectorAll('#levels .lv')].map(b=>b.classList.contains('lock'))")
        check(tag + " 17 クリアすると つぎが あく", lock[:3] == [False, False, False] and lock[3] is True, lock)
        check(tag + " 18 一覧に 星が 出る", "★★★" in pg.evaluate("()=>document.querySelector('#levels .lv small').textContent"))
        # --- こだま系の そうさ（ステージ7：こだま2つ）---
        pg.evaluate("()=>{localStorage.setItem('gk_echo',JSON.stringify({s1:3,s2:3,s3:3,s4:3,s5:3,s6:3}))}"); pg.reload(); pg.wait_for_timeout(400)
        pg.evaluate("()=>__ec.openLevel(6)"); pg.wait_for_timeout(300)
        keys(pg, "R"); pg.keyboard.press("Enter"); pg.wait_for_timeout(150)
        s = st(pg); check(tag + " 19 Enter で こだまを つくる", s["recs"] == ["R"] and s["cur"] == "", s)
        keys(pg, "WDD"); pg.keyboard.press(" "); pg.wait_for_timeout(150)
        s = st(pg); check(tag + " 20 Space でも こだま（2つめ）", s["recs"] == ["R", "WDD"], s)
        pg.keyboard.press("Enter"); pg.wait_for_timeout(100); s = st(pg)
        check(tag + " 21 3つめは つくれない・メッセージ", s["recs"] == ["R", "WDD"] and s["msgOn"], s)
        pg.keyboard.press("Backspace"); pg.wait_for_timeout(100); s = st(pg)
        check(tag + " 22 手が ないとき もどす → こだまが 手に もどる", s["recs"] == ["R"] and s["cur"] == "WDD", s)
        pg.keyboard.press("y"); pg.wait_for_timeout(100); s = st(pg)
        check(tag + " 23 さいしょから は 1回目では けさない（確認）", s["recs"] == ["R"] and s["msgOn"], s)
        pg.keyboard.press("y"); pg.wait_for_timeout(100); s = st(pg)
        check(tag + " 24 2回目で ぜんぶ けす", s["recs"] == [] and s["cur"] == "", s)
        keys(pg, "R"); pg.keyboard.press("Enter"); pg.wait_for_timeout(100)
        pg.keyboard.press("y"); pg.wait_for_timeout(2900); pg.keyboard.press("y"); pg.wait_for_timeout(100); s = st(pg)
        check(tag + " 25 確認は 2.6秒で きれる（また 1回目から）", s["recs"] == ["R"], s)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(150)
        check(tag + " 26 Esc で ステージ一覧へ", st(pg)["scr"] == "sel")
        # こたえで クリア（2つの こだま）
        pg.evaluate("()=>__ec.openLevel(6)"); pg.wait_for_timeout(200); solve_ui(pg, 6); pg.wait_for_timeout(900)
        check(tag + " 27 ステージ7（こだま2つ）を こたえ通りに クリア", st(pg)["won"], st(pg))
        # スワイプ
        pg.evaluate("()=>__ec.openLevel(0)"); pg.wait_for_timeout(300)
        box = pg.evaluate("()=>{const r=document.getElementById('cv').getBoundingClientRect();return [r.x,r.y,r.width,r.height]}")
        cx, cy = box[0] + box[2] / 2, box[1] + box[3] / 2
        pg.mouse.move(cx, cy); pg.mouse.down(); pg.mouse.move(cx, cy + 60, steps=4); pg.mouse.up(); pg.wait_for_timeout(150)
        check(tag + " 28 下へ スワイプ → ▼", st(pg)["cur"] == "D", st(pg))
        pg.mouse.move(cx, cy); pg.mouse.down(); pg.mouse.move(cx + 8, cy + 3, steps=2); pg.mouse.up(); pg.wait_for_timeout(100)
        check(tag + " 29 ちいさな ゆびの ゆれ（22px未満）では 動かない", st(pg)["cur"] == "D", st(pg))
        # れんだ：200回
        t0 = time.time()
        for i in range(200): pg.keyboard.press("x")
        pg.wait_for_timeout(300); s = st(pg)
        check(tag + " 30 200回 れんだしても 80手で とまり、エラーなし (%.1f秒)" % (time.time() - t0), len(s["cur"]) == 80 and not errs(logs), (len(s["cur"]), errs(logs)[:1]))
        check(tag + " 31 ながすぎの メッセージ", s["msgOn"] and len(s["msg"]) > 3, s["msg"])
        # たいかい中に リサイズ・向き
        for (w, h) in ((320, 480), (480, 320), (1920, 1080), (600, 900), (420, 820)):
            pg.set_viewport_size({"width": w, "height": h}); pg.wait_for_timeout(300)
            px = pg.evaluate("()=>{const cv=document.getElementById('cv');const x=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;let n=0;for(let i=3;i<x.length;i+=4*97)if(x[i]>0)n++;return [n,cv.width,cv.height,document.documentElement.scrollWidth-innerWidth]}")
            r = pg.evaluate("()=>[...document.querySelectorAll('#ctrl button')].filter(b=>b.offsetParent).map(b=>{const r=b.getBoundingClientRect();return [r.left,r.right,r.bottom]}).filter(a=>a[0]<-1||a[1]>innerWidth+1||a[2]>innerHeight+1).length")
            check(tag + " 32 %dx%d でも 絵が出て、ボタンが はみ出さない" % (w, h), px[0] > 50 and px[3] <= 1 and r == 0, (px, r))
        pg.screenshot(path="/tmp/out/ec_resized_%s.png" % tag)
        check(tag + " 33 ページエラー・404 なし", not errs(logs) and not bad, (errs(logs)[:2], bad[:2]))
        b.close()
print("\nこだまの部屋 UIテスト %d / %d" % (sum(res), len(res))); sys.exit(0 if all(res) else 1)
