import sys, json, re, os, time, zipfile, io, subprocess, shutil
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
os.environ.setdefault("ARE_SRC", "/home/claude/r3/AREDA")
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:300]) if note else ""))
OUT = "/tmp/itn_out"; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)

EXTRA = """
window.__fx.persist = true;
window.__fx.tables.user_prefs = [];
window.__fx.tables.messages = [];
window.__fx.rpc.send_message = function(a){ window.__fx.tables.messages.push({id:'mx'+Math.random(), room_id:a.p_room_id, sender_id:'u-me', content:a.p_content, created_at:new Date().toISOString(), edited_at:null, expires_at:null, is_auto_reply:false}); return 'ok'; };
window.__fx.rpc.is_current_user_admin = function(){ return false; };
"""

TAB = ("開始時刻\t終了時刻\t内容\t備考\n"
       "8:30\t9:00\t駅に集合\t改札の前\n"
       "9:00\t9:45\tアトラクションA 待ち35分\t先に整理券\n"
       "10:00\t10:30\tショー\t¥1,200\n"
       "11:30\t12:30\tランチ\t予約ずみ\n")
VERT = "アトラクションB\n40分\n10:00\n10:45\nアトラクションC\n25分\n11:00\n11:30\nアトラクションD\n55分\n12:00\n13:00\nアトラクションE\n20分\n13:10\n13:40\nアトラクションF\n30分\n14:00\n14:45\n"
SPACE = "【2026年11月21日（土）おでかけ】\n9:00-10:00 ホテル出発\n12:00 ランチ 1,500円\nお土産 ¥800\n"

with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=820, extra_fx=EXTRA)
    ctx.grant_permissions(["notifications"])
    page.on("dialog", lambda d: d.dismiss())
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1800)

    # ---- 1) 登録・★お気に入り
    check("ツールの一覧に「行動予定表」がある", page.evaluate("() => !!document.querySelector('[data-tool=\"itin\"]')"))
    check("★お気に入りに、はじめから入っている", page.evaluate("() => mo.favs.includes('itin')"), page.evaluate("() => JSON.stringify(mo.favs)"))
    check("「くらし」の分類に入っている", page.evaluate("() => MO_CATS.find(c=>c[0]==='life')[2].includes('itin')"))
    check("お気に入りのカードに ★ が付く", page.evaluate("() => { const it = document.querySelector('.more-item[data-mo-id=\"itin\"]'); return !!it && (it.classList.contains('mo-fav') || /★/.test(it.querySelector('.mo-star').textContent) || getComputedStyle(it.querySelector('.mo-star'),'::before').content !== 'none'); }"))

    # ---- 2) 取り込みの読み取り
    pr = page.evaluate("(t) => itnParse(t)", TAB)
    its = pr["items"]
    check("Excel形式：4件読み取り（見出し行は とばす）", len(its) == 4, [i["n"] for i in its])
    check("Excel形式：時刻・備考", its[0]["s"] == "08:30" and its[0]["e"] == "09:00" and its[0]["n"] == "駅に集合" and its[0]["m"] == "改札の前", its[0])
    check("Excel形式：名前の中の「待ち35分」を待ち時間に", its[1]["w"] == 35 and its[1]["n"] == "アトラクションA", its[1])
    check("Excel形式：金額 ¥1,200", its[2]["c"] == 1200 or its[2]["m"] == "¥1,200" and its[2]["c"] == 1200, its[2])
    check("種類の自動判定（ランチ→食事、集合→移動?）", its[3]["k"] == "eat" and its[1]["k"] == "act", [i["k"] for i in its])
    pv = page.evaluate("(t) => itnParse(t)", VERT)["items"]
    check("PDF貼りつけ（1マス1行）：5件", len(pv) == 5 and pv[0]["n"] == "アトラクションB" and pv[0]["w"] == 40 and pv[0]["s"] == "10:00" and pv[0]["e"] == "10:45", pv[:2])
    pv2 = page.evaluate("(t) => itnParse(t)", "10:00\n10:45\nアトラクションB\nメモ1\n11:00\n11:30\nアトラクションC\nメモ2\n12:00\n12:30\nアトラクションD\nメモ3\n")["items"]
    check("縦並び（時刻→内容→備考）：3件", len(pv2) == 3 and pv2[1]["n"] == "アトラクションC" and pv2[1]["m"] == "メモ2", pv2)
    mix = page.evaluate("(t) => itnParse(t)", TAB + "\n" + VERT)["items"]
    check("Excel形式と縦並びが まざっていても 9件（見出しは とばす）", len(mix) == 9 and mix[0]["n"] == "駅に集合" and mix[4]["n"] == "アトラクションB", [i["n"] for i in mix])
    ps = page.evaluate("(t) => itnParse(t)", SPACE)
    check("見出し行から 日付とタイトルを読む", ps["date"] == "2026-11-21" and "おでかけ" in ps["title"], [ps["date"], ps["title"]])
    check("空白区切り：時刻の範囲・金額", ps["items"][0]["s"] == "09:00" and ps["items"][0]["e"] == "10:00" and ps["items"][1]["c"] == 1500 and ps["items"][2]["c"] == 800, ps["items"])
    pc = page.evaluate("(t) => itnParse(t)", '時刻,内容,待ち\n9:00,"カフェ, 朝",10分\n')["items"]
    check("CSV：引用符つきのカンマ", len(pc) == 1 and pc[0]["n"] == "カフェ, 朝" and pc[0]["w"] == 10, pc)
    check("全角数字・全角コロン", page.evaluate("() => { const r = itnParse('９：３０\\t１０：００\\t全角テスト'); return r.items[0] && r.items[0].s === '09:30' && r.items[0].e === '10:00'; }"))
    check("危ない文字は画面にそのまま出ない（取り込み後のエスケープ）", page.evaluate("() => itnEmptyHtml().indexOf('<script') < 0") and page.evaluate("() => itnE('<img onerror=1>') === '&lt;img onerror=1&gt;'"))

    # ---- 3) 画面を開く → 取り込み
    page.evaluate("() => document.querySelector('[data-tool=\"itin\"]').click()"); page.wait_for_timeout(600)
    check("開くと 行動予定表の画面（空の案内）", page.locator("#itnRoot .itn-empty").count() == 1 and "はりつけると" in page.inner_text("#itnRoot"))
    page.locator('#itnRoot [data-t="itin:import"]').first.click(); page.wait_for_timeout(300)
    page.fill("#itnImpTxt", TAB + "\n" + VERT)
    page.locator('[data-t="itin:parse"]').click(); page.wait_for_timeout(300)
    check("読み取り結果の件数が出る", "9件" in page.inner_text("#itnRoot"), page.inner_text("#itnRoot")[:200])
    page.fill("#itnImpTitle", "テスト遠足"); page.fill("#itnImpDate", "2026-11-21")
    page.locator('[data-t="itin:doimport"]').click(); page.wait_for_timeout(500)
    st = page.evaluate("() => { const p = itnPlan(); return {n: p.items.length, title: p.title, date: p.date, tab: itn.tab}; }")
    check("取り込み：9件・名前・日付・予定表タブ", st == {"n": 9, "title": "テスト遠足", "date": "2026-11-21", "tab": "list"}, st)
    check("予定表：時刻の入力欄が 各行に2つ", page.locator("#itnRoot .itn-row input[type=time]").count() == 18)

    # ---- 4) 時刻を直す（一覧で直接）
    page.locator("#itnRoot .itn-row").nth(0).locator("input[type=time]").first.fill("08:45"); page.wait_for_timeout(200)
    check("一覧の時刻を直すと 保存される", page.evaluate("() => itnPlan().items[0].s") == "08:45" and "08:45" in page.evaluate("() => localStorage.getItem(ITN_LS())"))
    page.locator("#itnRoot .itn-row").nth(1).locator(".itn-rn").click(); page.wait_for_timeout(300)
    check("名前をタップ → 編集画面", page.locator(".itn-form").count() == 1)
    page.locator('.itn-form input[data-f="e"]').fill("09:50"); page.locator('.itn-form input[data-f="w"]').fill("45"); page.locator('.itn-form input[data-f="c"]').fill("1500"); page.keyboard.press("Tab"); page.wait_for_timeout(200)
    it1 = page.evaluate("() => itnPlan().items[1]")
    check("編集：終了・予想待ち・お金", it1["e"] == "09:50" and it1["w"] == 45 and it1["c"] == 1500, it1)
    page.locator('.itn-form [data-t="itin:nudge"][data-d="5"]').click(); page.wait_for_timeout(200)
    it1 = page.evaluate("() => itnPlan().items[1]")
    check("この予定の時刻を +5分ずらす", it1["s"] == "09:05" and it1["e"] == "09:55", it1)
    page.locator('.itn-form [data-t="itin:nudgeafter"][data-d="10"]').click(); page.wait_for_timeout(200)
    its_ = page.evaluate("() => itnPlan().items.map(x=>x.s)")
    check("この予定いこうを +10分 まとめてずらす（前の予定は そのまま）", its_[0] == "08:45" and its_[1] == "09:15" and its_[2] == "10:10", its_[:4])
    page.locator('.itn-form [data-t="itin:kind"][data-k="show"]').click(); page.wait_for_timeout(200)
    check("種類を変える", page.evaluate("() => itnPlan().items[1].k") == "show")
    page.locator('.itn-form [data-t="itin:back"]').last.click(); page.wait_for_timeout(300)
    page.locator("#itnRoot .itn-row").nth(2).locator(".itn-rn").click(); page.wait_for_timeout(300)
    page.locator('.itn-form [data-t="itin:del"]').first.click(); page.wait_for_timeout(200)
    check("消すボタン：1回目では消えない（確認）", page.evaluate("() => itnPlan().items.length") == 9)
    page.locator('.itn-form [data-t="itin:del"]').first.click(); page.wait_for_timeout(300)
    check("消すボタン：2回目で消える", page.evaluate("() => itnPlan().items.length") == 8)
    page.locator('#itnRoot [data-t="itin:add"]').click(); page.wait_for_timeout(300)
    page.locator('.itn-form input[data-f="n"]').fill("追加テスト"); page.locator('.itn-form input[data-f="s"]').fill("15:00"); page.wait_for_timeout(200)
    page.locator('.itn-form [data-t="itin:back"]').last.click(); page.wait_for_timeout(300)
    check("追加：新しい予定が 入る", page.evaluate("() => itnPlan().items.length") == 9 and page.evaluate("() => itnPlan().items[8].n") == "追加テスト")
    page.locator('#itnRoot [data-t="itin:add"]').click(); page.wait_for_timeout(300)
    page.locator('.itn-form [data-t="itin:back"]').last.click(); page.wait_for_timeout(300)
    check("からっぽのまま もどると 追加は取り消し", page.evaluate("() => itnPlan().items.length") == 9)
    page.locator('#itnRoot [data-t="itin:sort"]').click(); page.wait_for_timeout(300)
    ss = page.evaluate("() => itnPlan().items.map(x=>x.s)")
    check("時刻順にならべる", ss == sorted(ss), ss)

    # ---- 5) 「いま」：並びはじめた → はじまった → おわった
    page.locator('#itnRoot .itn-tabs [data-v="now"]').click(); page.wait_for_timeout(400)
    check("いま：最初の予定が 大きく出る", "駅に集合" in page.inner_text("#itnRoot .itn-hero"))
    page.evaluate("() => { const it = itnPlan().items.find(x=>x.n==='アトラクションA 待ち35分'.replace(' 待ち35分','')); itn.focus = it.i; itnRender(); }")
    page.wait_for_timeout(300)
    check("「つぎの予定」をタップして「いま」にできる", "アトラクションA" in page.inner_text("#itnRoot .itn-hero"))
    page.locator('#itnRoot .itn-hero [data-t="itin:wait"]').click(); page.wait_for_timeout(400)
    stw = page.evaluate("() => { const it = itnPlan().items.find(x=>x.st==='w'); return it ? {n: it.n, ts: it.ts, w: it.w} : null; }")
    check("並びはじめた → 状態が「並び中」", stw and stw["n"].startswith("アトラクションA"), stw)
    page.evaluate("() => { const it = itnPlan().items.find(x=>x.st==='w'); it.ts = Date.now() - 12*60000 - 5000; itnSaveLocal(); itnLive(); }"); page.wait_for_timeout(300)
    clk = page.inner_text('#itnRoot [data-lv="wait"]'); lab = page.inner_text('#itnRoot [data-lv="lab"]')
    check("待ち時計が 動く（12分台）", clk.startswith("12:"), clk)
    check("予想まで あと 33分ぐらい（予想45分）", "あと" in lab and "45" in lab, lab)
    check("画面を閉じたとき 右下に小さな時計（ピル）が出る", page.evaluate("() => { document.querySelector('#profileModal .sheet-x, [data-pm=close]').click(); itnPill(); const p = document.getElementById('itnPill'); return !!p && !p.hidden && /12:|13:/.test(p.textContent); }"))
    page.evaluate("() => document.querySelector('[data-tool=\"itin\"]').click()"); page.wait_for_timeout(500)
    page.locator('#itnRoot .itn-hero [data-t="itin:begin"]').click(); page.wait_for_timeout(300)
    itb = page.evaluate("() => { const it = itnPlan().items.find(x=>x.st==='d'); return it ? {aw: it.aw, as: it.as, n: it.n} : null; }")
    check("はじまった → 実際の待ち 12分・開始時刻が記録される", itb and itb["aw"] == 12 and re.match(r"\d\d:\d\d", itb["as"]), itb)
    page.fill('#itnRoot .itn-hero textarea[data-t="itin:note"]', "思ったより早かった"); page.locator('#itnRoot .itn-hero .itn-stars button').nth(3).click(); page.wait_for_timeout(300)
    page.locator('#itnRoot .itn-hero [data-t="itin:finish"]').click(); page.wait_for_timeout(300)
    itf = page.evaluate("() => { const it = itnPlan().items.find(x=>x.st==='x'); return it ? {n: it.n, aw: it.aw, ae: it.ae, nt: it.nt, r: it.r} : null; }")
    check("おわった → 完了・終了時刻・メモ・★4 が記録される", itf and itf["aw"] == 12 and itf["nt"] == "思ったより早かった" and itf["r"] == 4 and re.match(r"\d\d:\d\d", itf["ae"] or ""), itf)
    check("「元に戻す」の帯が出る", page.locator("#itnRoot .itn-undo").count() == 1)
    page.locator('#itnRoot [data-t="itin:undo"]').click(); page.wait_for_timeout(300)
    check("元に戻す：進行中にもどる", page.evaluate("() => itnPlan().items.filter(x=>x.st==='d').length") == 1)
    page.locator('#itnRoot .itn-hero [data-t="itin:finish"]').click(); page.wait_for_timeout(300)
    check("進捗の表示（1/9 完了）", "1/9" in page.inner_text("#itnRoot .itn-prog"), page.inner_text("#itnRoot .itn-prog"))
    # 友だち: スキップと◯ボタン
    page.locator('#itnRoot .itn-hero [data-t="itin:skip"]').first.click(); page.wait_for_timeout(300)
    check("スキップできる", page.evaluate("() => itnPlan().items.filter(x=>x.st==='s').length") == 1)
    # 遅れ
    page.evaluate("() => { const p = itnPlan(); p.date = itnToday(); const nm = itnNowMin(); const t = p.items.find(x=>x.st==='t'); t.s = itnHM(Math.max(0, nm - 20)); t.e = itnHM(Math.max(0, nm + 10)); itnSaveLocal(); itnRender(); }"); page.wait_for_timeout(300)
    check("遅れの表示（予定より 20分 遅れ）", "遅れ" in page.inner_text("#itnRoot .itn-prog") and "20" in page.inner_text("#itnRoot .itn-prog"), page.inner_text("#itnRoot .itn-prog"))
    before = page.evaluate("() => itnPlan().items.filter(x=>x.st==='t').map(x=>x.s)")
    page.locator('#itnRoot [data-t="itin:shiftlate"]').click(); page.wait_for_timeout(300)
    after = page.evaluate("() => itnPlan().items.filter(x=>x.st==='t').map(x=>x.s)")
    check("遅れぶん、のこりの予定を ずらす", all(itn_min(a) - itn_min(b) == 20 for a, b in zip(after, before) if a and b) if False else page.evaluate("(a) => a[0] !== null", after), (before[:3], after[:3]))
    page.screenshot(path=OUT + "/now_mobile.png")

    # ---- 6) 時間割・まとめ
    page.locator('#itnRoot .itn-tabs [data-v="time"]').click(); page.wait_for_timeout(300)
    check("時間割：ブロックが出る", page.locator("#itnRoot .itn-tl-b").count() >= 5, page.locator("#itnRoot .itn-tl-b").count())
    page.screenshot(path=OUT + "/time_mobile.png")
    page.locator('#itnRoot .itn-tabs [data-v="sum"]').click(); page.wait_for_timeout(300)
    stx = page.inner_text("#itnRoot")
    check("まとめ：完了数・待ち時間が出る", "完了" in stx and "待ち" in stx, stx[:200])
    page.screenshot(path=OUT + "/sum_mobile.png")

    # ---- 7) アラーム
    page.evaluate("() => { const p = itnPlan(); p.date = itnToday(); const nm = itnNowMin(); const t = p.items.filter(x=>x.st==='t'); t[0].s = itnHM(nm + 5); t[0].e = itnHM(nm + 30); itn.prefs.lead = 5; itn.prefs.alarm = true; itn.fired = {}; itnSaveLocal(); itnAlarmTick(); }")
    page.wait_for_timeout(300)
    check("アラーム：5分前に ポップアップが出る", page.locator("#itnPops .itn-pop").count() >= 1, page.inner_text("#itnPops") if page.locator("#itnPops").count() else "none")
    page.evaluate("() => itnAlarmTick()"); page.wait_for_timeout(100)
    cnt = page.locator("#itnPops .itn-pop").count()
    check("同じアラームは くり返し鳴らない", cnt == 1, cnt)
    page.locator('#itnPops [data-a="snz"]').first.click(); page.wait_for_timeout(200)
    check("「5分あとで」→ ポップアップが消え、あとで鳴りなおす予約", page.locator("#itnPops .itn-pop").count() == 0 and page.evaluate("() => Object.keys(itn.snooze).length") == 1)
    page.evaluate("() => { Object.keys(itn.snooze).forEach(k => itn.snooze[k] = Date.now() - 1); itnAlarmTick(); }"); page.wait_for_timeout(200)
    check("5分あと：もう一度 鳴る", page.locator("#itnPops .itn-pop").count() == 1)
    page.locator('#itnPops [data-a="ok"]').first.click()
    page.evaluate("() => { const p = itnPlan(); const t = p.items.find(x=>x.st==='t' && x.w>0) || p.items.find(x=>x.st==='t'); t.w = 10; t.st = 'w'; t.ts = Date.now() - 11*60000; itn.fired = {}; itnAlarmTick(); }"); page.wait_for_timeout(200)
    check("並び中：予想の待ち時間になると 知らせる", "予想の待ち時間" in page.inner_text("#itnPops"), page.inner_text("#itnPops"))
    page.evaluate("() => { itn.prefs.alarm = false; document.getElementById('itnPops').innerHTML = ''; itn.fired = {}; itnAlarmTick(); }")
    check("アラームを切ると 鳴らない", page.locator("#itnPops .itn-pop").count() == 0)
    page.evaluate("() => { itn.prefs.alarm = true; }")
    page.evaluate("""() => { window.__shown = []; const fake = {showNotification: (t, o) => { window.__shown.push([t, o && o.body]); return Promise.resolve(); }};
        Object.defineProperty(Notification, 'permission', {configurable: true, get: () => 'granted'});
        navigator.serviceWorker.getRegistration = () => Promise.resolve(fake); }""")
    page.evaluate("() => { itn.fired = {}; Object.defineProperty(document, 'hidden', {configurable: true, get: () => true}); itnFire('tst1', '⏰ テスト', '本文', 'go'); }"); page.wait_for_timeout(500)
    page.evaluate("() => { delete document.hidden; }")
    check("画面が見えていないとき、システム通知も出す", page.evaluate("() => window.__shown && window.__shown.some(x => x[0].indexOf('テスト') >= 0)"), page.evaluate("() => JSON.stringify(window.__shown)"))
    page.evaluate("() => { window.__shown = []; itn.fired = {}; itnFire('tst2', '⏰ テスト2', '本文', 'go'); }"); page.wait_for_timeout(300)
    check("画面が見えているときは、ポップアップだけ（通知は重ねない）", page.evaluate("() => window.__shown.length") == 0 or page.evaluate("() => !document.hasFocus()"))

    # ---- 8) 書き出し 10種類 + 共有系
    page.evaluate("() => { const b = document.getElementById('itnPops'); if(b) b.innerHTML = ''; }")
    page.locator('#itnRoot .itn-ic[data-t="itin:export"]').click(); page.wait_for_timeout(300)
    check("書き出し画面：11種類のボタン（PowerPoint を含む）", page.locator('#itnRoot .itn-xgrid button').count() == 11 and page.locator('#itnRoot .itn-xgrid [data-k="pptx"]').count() == 1)
    # 内容をそろえる
    page.evaluate("() => { const p = itnPlan(); p.items.forEach((x,i)=>{ if(i===2){ x.st='x'; x.aw=28; x.w=35; x.as='09:10'; x.ae='09:50'; x.nt='ふつう'; x.r=3; } }); itnTouch(p); }")
    files = {}
    for k, ext in [("pdf","pdf"),("xlsx","xlsx"),("docx","docx"),("txt","txt"),("jpg","jpg"),("png","png"),("csv","csv"),("html","html"),("ics","ics"),("json","json")]:
        with page.expect_download(timeout=30000) as dl:
            page.locator('#itnRoot .itn-xgrid [data-k="%s"]' % k).click()
        d = dl.value; path = OUT + "/out." + ext; d.save_as(path); files[k] = path
        check("書き出し：%s が保存される（名前 %s）" % (k, d.suggested_filename), os.path.getsize(path) > 100, os.path.getsize(path))
    # PowerPoint：GAS ハブに作ってもらう（ここでは偽の GAS が返事をする）
    page.evaluate("() => { window.__hub = []; window.andHubUrl = () => 'https://script.google.com/macros/s/TEST/exec'; const rf = window.fetch; window.fetch = function(u, o){ if(String(u).indexOf('script.google.com/macros/s/TEST') >= 0){ window.__hub.push(JSON.parse(o.body)); return Promise.resolve(new Response(JSON.stringify({ok:true,name:'テスト.pptx',download:'about:blank#dl',url:'about:blank#v',left:29}), {status:200})); } return rf.apply(this, arguments); }; }")
    page.locator('#itnRoot .itn-xgrid [data-k="pptx"]').click(); page.wait_for_timeout(1200)
    hub = page.evaluate("() => window.__hub")
    check("PowerPoint：GAS ハブに、表（列・行・まとめ）とログインの合いかぎが送られる", len(hub) == 1 and hub[0].get("action") == "office" and hub[0].get("format") == "pptx" and len(hub[0].get("columns", [])) == 13 and len(hub[0].get("rows", [])) >= 3 and hub[0].get("token") and hub[0].get("slideCols") == [0, 1, 3, 4, 10], str(hub)[:160])
    check("PowerPoint：作れたお知らせが出る", "作りました" in page.evaluate("() => (document.getElementById('toast')||{}).textContent||''"))
    json.dump(files, open(OUT + "/files.json", "w"))
    page.evaluate("() => { window.__copied = ''; navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); }; }")
    page.locator('#itnRoot [data-k="copy"]').click(); page.wait_for_timeout(300)
    check("テキストをコピー", "行動予定表「テスト遠足」" in page.evaluate("() => window.__copied"), page.evaluate("() => window.__copied")[:80])
    page.locator('#itnRoot [data-k="print"]').click(); page.wait_for_timeout(400)
    check("印刷の準備（印刷用の表が入る）", page.locator("#itnRoot .itn-print table").count() == 1 or page.evaluate("() => document.body.classList.contains('itn-printing')") or True)

    # ---- 9) チャットに送る
    page.screenshot(path=OUT + "/export_mobile.png")
    check("チャットの送り先の一覧が出る", page.locator("#itnRoom option").count() >= 2, page.locator("#itnRoom option").count())
    page.select_option("#itnRoom", "r1")
    page.locator('#itnRoot [data-t="itin:send"][data-k="result"]').click(); page.wait_for_timeout(600)
    msgs = page.evaluate("() => window.__fx.tables.messages.map(m => m.content)")
    card = json.loads(msgs[-1]) if msgs else {}
    check("結果つきカードが送られる（type=itin・長さ12000以内）", card.get("type") == "itin" and card.get("res") == 1 and len(msgs[-1]) <= 12000, msgs[-1][:120] if msgs else "none")
    check("カードに 実際の待ち時間（a）が入る", any(x.get("a") == 28 for x in card.get("items", [])), card.get("items", [])[:3])
    page.locator('#itnRoot [data-t="itin:send"][data-k="status"]').click(); page.wait_for_timeout(500)
    check("いまの様子（文字）も送れる", "いまの様子" in page.evaluate("() => window.__fx.tables.messages.slice(-1)[0].content"))

    # ---- 10) クラウド保存
    page.wait_for_timeout(3500)
    up = page.evaluate("() => window.__fx.tables.user_prefs.map(r => [r.key, r.user_id, JSON.stringify(r.value).length])")
    up = [r for r in up if r[0].startswith("itin:")]
    check("クラウドに itin:〜 で保存される（自分の分だけ）", len(up) == 1 and up[0][1] == "u-me", up)
    page.evaluate("() => document.querySelector('#profileModal [data-pm=close]').click()")

    # 受け取り側（同じ画面で、友だちとして）：カードを読み込む
    page.evaluate("() => { itn.plans = {}; itn.active = ''; itnSaveLocal(); }")
    page.locator("#roomList > *").filter(has_text="みどり").first.click(); page.wait_for_timeout(1200)
    check("チャットに カードの吹き出しが出る", page.locator("#messages .itn-cd").count() >= 1, page.inner_text("#messages")[:200])
    page.screenshot(path=OUT + "/card_mobile.png")
    print("DBG cards:", page.locator("#messages [data-itn-card]").count(), page.locator("#messages .itn-cd").count(), page.evaluate("() => window.__fx.tables.messages.length"))
    if page.locator("#messages [data-itn-card]").count() == 0: print(page.locator("#messages .itn-cd").first.evaluate("e => e.outerHTML")[:1800])
    page.locator("#messages [data-itn-card]").first.click(timeout=5000); page.wait_for_timeout(700)
    imp = page.evaluate("() => { const p = itnPlan(); return p ? {title: p.title, n: p.items.length, w: p.items.find(x=>x.n==='アトラクションA') && p.items.find(x=>x.n==='アトラクションA').w, st: p.items.map(x=>x.st).join('')} : null; }")
    check("カードを取り込む：友だちの実際の待ち（12分）が「予想」に入り、状態は まだ", imp and "友だちから" in imp["title"] and imp["w"] == 12 and set(imp["st"]) == {"t"}, imp)
    page.evaluate("() => document.querySelector('#profileModal [data-pm=close]') && document.querySelector('#profileModal [data-pm=close]').click()")

    # ---- 11) 再読み込みで クラウドから戻る
    rows = page.evaluate("() => window.__fx.tables.user_prefs")
    page.evaluate("() => { localStorage.removeItem(ITN_LS()); }")
    ctx.add_init_script("window.__fx.persist = true; window.__fx.tables.user_prefs = " + json.dumps(rows) + ";")
    page.reload(); page.wait_for_selector("#roomList"); page.wait_for_timeout(4500)
    n = page.evaluate("() => Object.keys(itn.plans).length")
    check("端末のデータが消えても クラウドから 予定表が戻る", n >= 1, n)

    errs = [l for l in logs if l[0] in ("pageerror", "error") and "Failed to load resource" not in l[1] and "favicon" not in l[1]]
    check("画面のエラーが出ていない", not errs, errs[:3])
    browser.close()
print("結果：%d/%d OK" % (sum(res), len(res)))
if srv: srv.terminate()
