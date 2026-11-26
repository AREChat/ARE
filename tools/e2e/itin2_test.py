import sys, json, re, os, time, shutil
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
os.environ.setdefault("ARE_SRC", "/home/claude/r3/AREDA")
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:300]) if note else ""))
OUT = "/tmp/itn2_out"; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
EXTRA = """
window.__fx.persist = true;
window.__fx.tables.user_prefs = [];
window.__fx.tables.messages = [];
window.__fx.rpc.is_current_user_admin = function(){ return false; };
"""
STUBS = """() => {
  window.__say = [];
  window.SpeechSynthesisUtterance = function(t){ this.text = t; };
  Object.defineProperty(window, 'speechSynthesis', {configurable: true, value: { speak: (u) => window.__say.push(u.text), cancel: () => {}, getVoices: () => [] }});
  navigator.geolocation.getCurrentPosition = (ok) => ok({coords: {latitude: 35.0000 + (window.__pos = (window.__pos || 0) + 0.003), longitude: 139.5}});
}"""
def open_itin(page):
    page.evaluate("() => document.querySelector('[data-tool=\"itin\"]').click()"); page.wait_for_timeout(600)
def mkplan(page, kind="park"):
    page.evaluate("(k) => { itnNewPlan('テスト予定', itnToday(), itnTplItems(k)); itnRender(); }", kind); page.wait_for_timeout(200)
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=820, extra_fx=EXTRA)
    ctx.grant_permissions(["notifications"])
    page.on("dialog", lambda d: d.dismiss())
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1800)
    page.evaluate(STUBS)
    open_itin(page); mkplan(page)
    # ---- ストリップ
    strip = page.inner_text("#itnRoot .itn-strip")
    check("道具のならびが出る（ボット・チェック・声・読み上げ）", all(w in strip for w in ["予定ボット", "チェック", "声で操作", "読み上げ", "のこりを読む"]), strip)
    check("読み上げは はじめから ON", page.evaluate("() => itn.prefs.speak === true"))
    # ---- 読み上げ（ボタンの動作）
    page.evaluate("() => { window.__say.length = 0; }")
    hero_wait = page.locator('.itn-hero [data-t="itin:wait"]').first
    hero_wait.click(); page.wait_for_timeout(300)
    s = page.evaluate("() => window.__say.join('|')")
    check("「並びはじめた」で 自動で読み上げる（名前）", "並びはじめました" in s, s)
    page.evaluate("() => { window.__say.length = 0; }")
    page.locator('.itn-hero [data-t="itin:begin"]').first.click(); page.wait_for_timeout(300)
    s = page.evaluate("() => window.__say.join('|')")
    check("「はじまった」で 待った時間を 読み上げる", "待ち時間は" in s and "はじまりました" in s, s)
    page.evaluate("() => { window.__say.length = 0; }")
    page.locator('.itn-hero [data-t="itin:finish"]').first.click(); page.wait_for_timeout(300)
    s = page.evaluate("() => window.__say.join('|')")
    check("「おわった」で つぎの予定まで 読み上げる", "おわりました" in s and "つぎは" in s, s)
    page.evaluate("() => { itn.prefs.speak = false; window.__say.length = 0; }")
    page.locator('.itn-hero [data-t="itin:wait"]').first.click(); page.wait_for_timeout(300)
    check("読み上げ OFF のときは しゃべらない", page.evaluate("() => window.__say.length") == 0)
    page.locator('.itn-strip [data-t="itin:sayplan"]').click(); page.wait_for_timeout(200)
    s = page.evaluate("() => window.__say.join('|')")
    check("「のこりを読む」は OFF でも 読み上げる（予定の数・時刻・名前）", "のこりの予定は" in s and "件です" in s, s)
    page.evaluate("() => { itn.prefs.speak = true; itn.prefs.speakEvery = 5; window.__say.length = 0; const pl = itnPlan(); const w = pl.items.find(x => x.st === 'w'); w.ts = Date.now() - 6 * 60000; itnAlarmTick(); }")
    s = page.evaluate("() => window.__say.join('|')")
    check("並んでいる間、5分ごとに「いま◯分」と読み上げる", "いま、5分" in s and "待っています" in s, s)
    page.evaluate("() => { itn.prefs.speakEvery = 0; }")
    # ---- 声のコマンド
    cmd = page.evaluate("() => ['ならびはじめた','並びはじめます','はじまった','乗れた','おわった','降りた','つぎは？','いま何分？','スキップ','もどして','こんにちは','今日の天気'].map(itnVoiceCmd)")
    check("声の言葉を 命令に直す", cmd == ["wait", "wait", "begin", "begin", "finish", "finish", "next", "now", "skip", "undo", "", ""], cmd)
    page.evaluate("() => { itnNewPlan('声テスト', itnToday(), [{n:'アトラクションX', s:'09:00', e:'10:00', w:20, k:'act'}, {n:'ランチ', s:'11:00', e:'12:00', k:'eat'}]); itnRender(); window.__say.length = 0; }")
    r = page.evaluate("() => { const out = []; ['ならびはじめた','はじまった','おわった'].forEach(t => { itnVoiceHandle(t); const it = itnPlan().items[0]; out.push(it.st); }); return out; }")
    check("声だけで 並ぶ→はじまり→おわり が進む", r == ["w", "d", "x"], r)
    s = page.evaluate("() => window.__say.join('|')")
    check("声の操作は 結果を 声で返す（つぎの予定も）", "おわり" in s and "ランチ" in s, s)
    r = page.evaluate("() => { itnVoiceHandle('もどして'); return itnPlan().items[0].st; }")
    check("「もどして」で ひとつ前に", r == "d", r)
    r = page.evaluate("() => { window.__say.length = 0; itnVoiceHandle('つぎは？'); return window.__say.join('|'); }")
    check("「つぎは？」で つぎの予定を 答える", "つぎは" in r or "ありません" in r, r)
    # ---- チェック＆自動調整
    page.evaluate("() => { itnNewPlan('重なり', itnToday(), [{n:'A', s:'09:00', e:'10:00', k:'act'}, {n:'B', s:'09:30', e:'10:30', k:'act'}, {n:'C', s:'10:00', e:'09:00', k:'act'}, {n:'D', s:'11:00', e:'11:20', w:40, k:'act'}, {n:'E', s:'12:00', k:'act'}, {n:'F', s:'13:00', e:'14:00', k:'act'}, {n:'G', s:'15:00', e:'16:00', k:'act'}]); itnRender(); }")
    iss = page.evaluate("() => itnCheck(itnPlan()).map(x => x.t)")
    check("チェック：重なり・時刻の逆・枠が足りない・お昼ぬけを 見つける", all(t in iss for t in ["lap", "rev", "slot", "meal"]), iss)
    page.locator('.itn-strip [data-t="itin:check"]').click(); page.wait_for_timeout(300)
    txt = page.inner_text("#itnRoot .itn-body")
    check("チェック画面に 問題の文が 出る", "重なっています" in txt and "自動で直す" in txt, txt[:160])
    page.screenshot(path=OUT + "/check.png")
    page.locator('[data-t="itin:autofix"]').click(); page.wait_for_timeout(300)
    iss = page.evaluate("() => itnCheck(itnPlan()).map(x => x.t)")
    check("自動で直すと、重なり・逆・枠不足が なくなる", not any(t in iss for t in ["lap", "rev", "slot"]), iss)
    order = page.evaluate("() => itnPlan().items.map(x => x.s || '99')")
    check("直したあと 時刻の順に ならぶ", order == sorted(order), order)
    check("「自動で直す前に もどす」ボタンが出る", page.locator('[data-t="itin:undoall"]').count() == 1)
    page.locator('[data-t="itin:undoall"]').click(); page.wait_for_timeout(300)
    iss = page.evaluate("() => itnCheck(itnPlan()).map(x => x.t)")
    check("もどすと 元の状態（重なりが ある）", "lap" in iss, iss)
    page.locator('.itn-back').first.click(); page.wait_for_timeout(200)
    # ---- 場所メモ
    mkplan(page)
    page.evaluate("() => { const pl = itnPlan(); itn.focus = pl.items[1].i; itnRender(); }")
    page.locator('.itn-hero [data-t="itin:place"]').first.click(); page.wait_for_timeout(400)
    p1 = page.evaluate("() => itnPlan().items.find(x => x.p) && itnPlan().items.find(x => x.p).p")
    check("「いまの場所を おぼえる」で 位置が 保存される", p1 and abs(p1[1] - 139.5) < 0.01, p1)
    html = page.inner_html("#itnRoot")
    check("地図・案内の リンクが 出る（外部リンクは noopener）", "openstreetmap.org" in html and 'rel="noopener noreferrer"' in html and "ここへ案内" in html)
    page.evaluate("() => { const pl = itnPlan(); const it = pl.items.find(x => x.p); const nx = pl.items[pl.items.indexOf(it) + 1]; itn.focus = nx.i; itnRender(); }")
    page.locator('.itn-hero [data-t="itin:place"]').first.click(); page.wait_for_timeout(400)
    html = page.inner_text("#itnRoot")
    check("つぎの場所では、前の場所からの 距離と 歩く時間が 出る", re.search(r"歩いて 約\d+分", html) is not None, html[-300:])
    pk = page.evaluate("() => itnPackPlan(itnPlan()).items.filter(x => x.p).length")
    check("場所は クラウドへ送る形（保存）にも 入る", pk == 2, pk)
    page.screenshot(path=OUT + "/place.png")
    # ---- 予定ボット
    page.evaluate("() => { itnRender(); }")
    page.locator('.itn-strip [data-t="itin:bot"]').click(); page.wait_for_timeout(300)
    check("ボットの あいさつと 候補が 出る", "予定ボット" in page.inner_text("#itnRoot") and page.locator(".itn-chips button").count() >= 3)
    page.fill("#itnBotIn", "10時から18時、こども連れでテーマパーク"); page.press("#itnBotIn", "Enter"); page.wait_for_timeout(400)
    check("Enter で 送れて、予定の案が 返る", page.locator(".itn-bot-prop").count() == 1, page.inner_text("#itnRoot")[-200:])
    prop = page.evaluate("() => itn.bot.prop")
    its = prop["items"]
    mins = lambda s: int(s[:2]) * 60 + int(s[3:])
    check("案は 10:00 から はじまり 18:00 までに おさまる", its[0]["s"] == "10:00" and mins(its[-1]["e"]) <= 18 * 60, [its[0]["s"], its[-1]["e"]])
    check("案に ランチと 休憩が 入る（こども連れ）", any(x["k"] == "eat" for x in its) and any(x["k"] == "rest" for x in its), [x["n"] for x in its])
    ok = all(mins(its[i]["s"]) >= mins(its[i-1]["e"]) for i in range(1, len(its)))
    check("案は 時刻が 重ならない", ok, [(x["s"], x["e"]) for x in its])
    check("待ち時間の目安が ついている（アトラクション）", any(x.get("w") for x in its if x["k"] == "act"))
    page.screenshot(path=OUT + "/bot.png")
    page.locator('[data-t="itin:botdo"][data-v="new"]').click(); page.wait_for_timeout(300)
    n = page.evaluate("() => itnPlan().items.length")
    check("「新しい予定表にする」で 案が 予定表になる", n == len(its) and page.evaluate("() => itnPlan().title") == prop["title"], n)
    # 聞き返し
    page.locator('[data-t="itin:bot"]').first.click() if page.locator('[data-t="itin:bot"]').count() else None
    page.wait_for_timeout(200)
    if page.locator("#itnBotIn").count() == 0:
        page.locator('.itn-back').first.click(); page.wait_for_timeout(200); page.locator('.itn-strip [data-t="itin:bot"]').click(); page.wait_for_timeout(300)
    page.fill("#itnBotIn", "予定を作って"); page.locator('[data-t="itin:botsend"]').click(); page.wait_for_timeout(300)
    check("種類が わからないときは 聞き返す", "どんな日" in page.inner_text("#itnRoot"))
    page.locator('.itn-chips button', has_text="旅行").first.click(); page.wait_for_timeout(300)
    check("時間も 聞き返す", "何時から" in page.inner_text("#itnRoot"))
    page.fill("#itnBotIn", "9時から17時"); page.locator('[data-t="itin:botsend"]').click(); page.wait_for_timeout(300)
    check("答えると 案が 出る（旅行）", page.evaluate("() => itn.bot.prop && itn.bot.prop.kind") == "trip")
    # 全種類・乱数で 案が こわれない
    bad = page.evaluate("""() => { const bad = []; const kinds = ['park','trip','work','event','queue','shop']; const mn = (s) => Number(s.slice(0,2))*60 + Number(s.slice(3));
        for(const k of kinds){ for(let i = 0; i < 40; i++){ const st = 360 + Math.floor(Math.random() * 14) * 30, en = st + 60 + Math.floor(Math.random() * 12) * 30, o = {kind: k, start: st, end: Math.min(en, 1400), kids: i % 2 === 0, pace: [0.7, 1, 1.35][i % 3], show: i % 4 === 0, shop: i % 5 === 0, eat: i % 3 === 0};
            let p; try{ p = itnBotBuild(o); }catch(e){ bad.push([k, 'throw', String(e)]); continue; }
            const it = p.items; if(it.length < 2) bad.push([k, 'few', o]);
            for(let j = 0; j < it.length; j++){ const x = it[j]; if(!x.n || !x.s || !x.e || mn(x.e) <= mn(x.s)) bad.push([k, 'bad item', x]); if(j && mn(x.s) < mn(it[j-1].e)) bad.push([k, 'overlap', it[j-1], x]); if(!ITN_CATS.some(c => c[0] === x.k)) bad.push([k, 'kind', x.k]); }
            if(it.length && mn(it[it.length-1].e) > 1410) bad.push([k, 'late', it[it.length-1].e]);
        } } return bad.slice(0, 5); }""")
    check("6種類 × 240通りの条件で 案が こわれない（重ならない・時刻が正しい）", not bad, bad)
    # アドバイス・予想・調整
    page.evaluate("() => { itnNewPlan('相談', itnToday(), [{n:'A', s:'09:00', e:'10:30', k:'act', w:50}, {n:'B', s:'10:10', e:'11:00', k:'act', w:60}, {n:'C', s:'11:30', e:'12:30', k:'act', w:30}, {n:'D', s:'13:00', e:'14:00', k:'act', w:50}, {n:'E', s:'14:30', e:'16:00', k:'act', w:20}, {n:'F', s:'16:30', e:'17:30', k:'act'}]); }")
    r = page.evaluate("() => itnBotReply('いまの予定を見てアドバイス').text")
    check("アドバイス：重なり・休憩なし・長い待ち を指摘", "重なって" in r and "休憩" in r and "待ち" in r, r)
    r = page.evaluate("() => itnBotReply('待ち時間を予想して').text")
    check("予想：時間帯のめやす つき", "約" in r and "分" in r and "目安" in r, r)
    r = page.evaluate("() => { const b = itnPlan().items.map(x => x.s); const t = itnBotReply('30分おくらせて'); return [t.text, itnPlan().items[0].s, b[0]]; }")
    check("「30分おくらせて」で のこりの予定が ずれる", r[1] == "09:30" and r[2] == "09:00", r)
    r = page.evaluate("() => { const w0 = itnPlan().items[0].w; itnBotReply('のこりの予想を 1.5倍に 補正して'); return [w0, itnPlan().items[0].w]; }")
    check("「予想を1.5倍に補正」で 予想の待ちが 変わる", r[1] == round(r[0] * 1.5), r)
    r = page.evaluate("() => { const n = itnPlan().items.length; itnBotReply('休憩を入れて'); const ni = itnPlan().items.find(x => x.n === '休憩'); return [n, itnPlan().items.length, !!ni]; }")
    check("「休憩を入れて」で 休憩が ふえる", r[1] == r[0] + 1 and r[2], r)
    r = page.evaluate("() => { itnBotReply('ランチを入れて'); return itnPlan().items.some(x => x.n === 'ランチ' && x.k === 'eat'); }")
    check("「ランチを入れて」で お昼が 入る", r)
    r = page.evaluate("() => itnBotReply('なんでもない話').text")
    check("わからない言葉には 使いかたを 返す", "こんなふうに" in r)
    # ---- みんなの待ち時間（サーバーに 関数が ない → かくれる）
    page.evaluate("() => { itn.crowdOff = false; itn.crowdAt = 0; }")
    page.evaluate("() => { window.__fx.rpc.itin_wait_stats = function(){ throw new Error('Could not find the function public.itin_wait_stats(p_names) in the schema cache'); }; }")
    page.evaluate("() => itnCrowdFetch(true)"); page.wait_for_timeout(500)
    off = page.evaluate("() => itn.crowdOff")
    check("サーバーに 関数が ないときは 静かに かくれる（エラーを出さない）", off is True, off)
    # ---- 関数が あるとき
    page.evaluate("""() => { window.__fx.rpc.itin_wait_stats = function(a){ window.__rpcStats = a; return a.p_names.map(n => ({name_key: n, n: 12, users: 5, avg_min: 38.4, median_min: 35})); };
        window.__fx.rpc.itin_report_wait = function(a){ (window.__reports = window.__reports || []).push(a); return true; };
        itn.crowdOff = false; itn.crowdAt = 0; itn.crowd = {}; }""")
    page.evaluate("() => { itnNewPlan('みんな', itnToday(), [{n:'アトラクション Ａ', s:'09:00', e:'10:00', w:30, k:'act'}, {n:'ランチ', s:'11:00', e:'12:00', k:'eat'}]); itn.focus = itnPlan().items[0].i; itn.sub = ''; itn.tab = 'now'; itnRender(); }")
    page.evaluate("() => itnCrowdFetch(true)"); page.wait_for_timeout(500)
    keys = page.evaluate("() => window.__rpcStats && window.__rpcStats.p_names")
    check("名前は そろえた かぎ（全角半角・空白・大文字小文字なし）で 送る", keys and "アトラクションa" in keys, keys)
    line = page.inner_text("#itnRoot")
    check("みんなの平均が 画面に出る（人数・名前はわからない）", "みんなの待ち時間" in line and "平均 38分" in line and "5人" in line, line[:200])
    page.screenshot(path=OUT + "/crowd.png")
    page.evaluate("() => { window.__reports = []; itn.prefs.crowd = false; const it = itnPlan().items[0]; itnAdvance(itnPlan(), it, 'wait'); itnPlan().items[0].ts = Date.now() - 12 * 60000; itnAdvance(itnPlan(), itnPlan().items[0], 'begin'); }"); page.wait_for_timeout(300)
    check("共有スイッチが OFF のときは、何も送らない", page.evaluate("() => (window.__reports || []).length") == 0)
    page.evaluate("() => { window.__reports = []; itn.prefs.crowd = true; const pl = itnPlan(); const it = pl.items[0]; it.st = 't'; it.ts = 0; itnAdvance(pl, it, 'wait'); it.ts = Date.now() - 12 * 60000; itnAdvance(pl, it, 'begin'); }"); page.wait_for_timeout(300)
    rep = page.evaluate("() => window.__reports")
    check("ON のときだけ、名前を伏せて「かぎ・待ち分・時間帯」だけ 送る", len(rep) == 1 and rep[0]["p_name"] == "アトラクションa" and 11 <= rep[0]["p_wait"] <= 13 and 0 <= rep[0]["p_hour"] <= 23 and set(rep[0].keys()) == {"p_name", "p_wait", "p_hour"}, rep)
    # ---- 思い出カード
    page.evaluate("() => { const pl = itnPlan(); pl.items.forEach((x, i) => { x.st = 'x'; x.aw = 10 + i * 8; x.w = 15 + i * 5; x.r = i === 0 ? 5 : 0; x.nt = i === 0 ? 'ふわふわで 楽しかった' : ''; }); itnTouch(pl); }")
    cv = page.evaluate("() => { const c = itnMemoryCanvas(itnPlan()); return [c.width, c.height]; }")
    check("思い出カードの 画像が 作れる（1080×1440）", cv == [1080, 1440], cv)
    page.evaluate("() => { itn.sub = ''; itn.tab = 'sum'; itnRender(); }")
    with page.expect_download() as d:
        page.locator('[data-t="itin:x"][data-k="memory"]').first.click()
    path = OUT + "/" + d.value.suggested_filename; d.value.save_as(path)
    from PIL import Image
    im = Image.open(path)
    check("思い出カードが JPEG で 保存される", path.endswith(".jpg") and im.size == (1080, 1440) and im.format == "JPEG", (d.value.suggested_filename, im.size))
    im.resize((540, 720)).save(OUT + "/memory_small.png")
    # ---- 設定画面
    page.evaluate("() => { itn.sub = 'alarm'; itnRender(); }")
    t = page.inner_text("#itnRoot")
    check("設定に 読み上げの 項目が 出る（はやさ・間かく・テスト）", all(w in t for w in ["読み上げ", "声の はやさ", "間かく"]) and "みんなの目安" in t, t[:200])
    page.evaluate("() => { itn.crowdOff = true; itnRender(); }")
    check("みんなの待ち時間が 使えないときは その項目が かくれる", "みんなの目安" not in page.inner_text("#itnRoot"))
    errs = [l for l in logs if "pageerror" in str(l).lower() or "Uncaught" in str(l)]
    check("ページの エラーなし", not errs, errs[:3])
    browser.close()
print("結果：%d/%d %s" % (sum(res), len(res), "OK" if all(res) else "NG"))
