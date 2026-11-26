import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:200]) if note else ""), flush=True)
UID = "u-me"
def fx(table=None, local=None, guest=False):
    s = "window.__fx.persist = true;\nwindow.__fx.tables.user_prefs = %s;\n" % json.dumps(table or [])
    if guest: s += "window.__fx.rpc.guest_status_me=function(){return {guest:true};};\n"
    else: s += "window.__fx.rpc.guest_status_me=function(){return {guest:false};};\n"
    for k, v in (local or {}).items():
        s += "try{ if(!localStorage.getItem('__seeded_%s')){ localStorage.setItem(%s, %s); localStorage.setItem('__seeded_%s','1'); } }catch(e){}\n" % (k, json.dumps(k), json.dumps(v), k)
    return s
def boot(p, table=None, local=None, guest=False):
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=fx(table, local, guest))
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2500)
    return browser, page, logs
def table(page): return page.evaluate("()=>JSON.parse(JSON.stringify(window.__fx.tables.user_prefs||[]))")
def ls(page, k): return page.evaluate("(k)=>localStorage.getItem(k)", k)
def setls(page, k, v): page.evaluate("([k,v])=>localStorage.setItem(k,v)", [k, v])
HK = "are_hidden_rooms_" + UID
with sync_playwright() as p:
    # 端末A：設定を変えて、ログアウトの直前に送り終える
    A, pa, logsA = boot(p)
    check("0 起動して同期が有効", pa.evaluate("()=>window.ARESync.state().on") is True)
    setls(pa, HK, '["r1"]')
    setls(pa, "are_drafts_" + UID, '{"r2":"途中の文"}')
    setls(pa, "are_theme", "forest")
    setls(pa, "are_lock_" + UID, "PINDATA")                     # 端末ごと（同期しない）
    setls(pa, "are_geo_watch", "1")                             # 端末ごと（同期しない）
    ok = pa.evaluate("async()=>{ await AREAuth.logout(); return true; }")   # ログアウトの直前に送る（待たずに すぐ）
    t = table(pa); keys = [r["key"] for r in t]
    check("1a ログアウト直前の変更がサーバーに入る（非表示の部屋）", "ls:are_hidden_rooms" in keys, keys)
    check("1b 下書き・テーマも入る", "ls:are_drafts" in keys and "ls:are_theme" in keys, keys)
    check("1c 端末ごとの項目（アプリロック・位置の監視）は入らない", not any("lock" in k or "geo" in k for k in keys), keys)
    server = t
    A.close()
    # 端末B：まっさらな端末でログイン → 最新の状態
    B, pb, logsB = boot(p, table=server)
    check("2a 別の端末にログインすると、非表示の部屋が引きつがれる", ls(pb, HK) == '["r1"]', ls(pb, HK))
    check("2b 下書きが引きつがれる", ls(pb, "are_drafts_" + UID) == '{"r2":"途中の文"}', ls(pb, "are_drafts_" + UID))
    check("2c テーマが引きつがれる", ls(pb, "are_theme") == "forest", ls(pb, "are_theme"))
    hid = pb.evaluate("()=>{const b=document.querySelector('#roomList [data-room-id=\"r1\"]');return b?(b.classList.contains('hr-hide')||getComputedStyle(b).display==='none'):null}")
    check("2d 画面でも r1 が非表示になっている", hid is True, hid)
    check("2e アプリロックの値は他の端末に行かない", ls(pb, "are_lock_" + UID) is None)
    # 長い値（日本語、分割）
    big = "あ" * 30000 + "ABC🙂" + "い" * 9000
    setls(pb, "are_myai_" + UID, big)
    pb.evaluate("()=>ARESync.flush()")
    t2 = table(pb)
    chunks = [r for r in t2 if r["key"].startswith("lc:are_myai:")]
    mx = max([len(json.dumps(r["value"], ensure_ascii=False).encode("utf-8")) for r in chunks] or [0])
    check("3a 長い値は分割して送る（1行 20000バイト未満）", len(chunks) >= 3 and mx < 20000, (len(chunks), mx))
    B.close()
    C, pc, logsC = boot(p, table=t2)
    check("3b 分割した値が、もとどおり つなぎ直される（文字化けなし）", ls(pc, "are_myai_" + UID) == big, len(ls(pc, "are_myai_" + UID) or ""))
    # 新しいほうが勝つ／削除も伝わる／動いている画面にも反映
    setls(pc, HK, '["r1","r2"]')
    pc.evaluate("()=>ARESync.flush()")
    tC = table(pc)
    D, pd, logsD = boot(p, table=t2)                            # D はまだ古い状態で起動
    check("4a D は古い状態から始まる", ls(pd, HK) == '["r1"]', ls(pd, HK))
    pd.evaluate("(t)=>{ window.__fx.tables.user_prefs = t; }", tC)   # サーバーに C の変更が入った
    ch = pd.evaluate("()=>ARESync.pull()")
    check("4b 動いている画面が、ほかの端末の変更を受け取る", ls(pd, HK) == '["r1","r2"]' and "are_hidden_rooms" in ch, (ls(pd, HK), ch))
    both = pd.evaluate("()=>[...document.querySelectorAll('#roomList [data-room-id]')].filter(b=>b.classList.contains('hr-hide')).length")
    check("4c 非表示の部屋が 画面にも反映される（r1・r2）", both == 2, both)
    pc.evaluate("()=>localStorage.removeItem('are_theme')"); pc.evaluate("()=>ARESync.flush()")
    pd.evaluate("(t)=>{ window.__fx.tables.user_prefs = t; }", table(pc)); pd.evaluate("()=>ARESync.pull()")
    check("4d 消した設定も、ほかの端末で消える", ls(pd, "are_theme") is None, ls(pd, "are_theme"))
    # 古い端末が、新しい変更を上書きしない
    setls(pd, "are_weather_place", "OLD")
    pd.evaluate("()=>{ const s=ARESync.state(); }")
    srv2 = table(pc)
    pd.evaluate("(t)=>{ window.__fx.tables.user_prefs = t; }", srv2)
    setls(pc, "are_weather_place", "NEW")
    pc.evaluate("()=>ARESync.flush()")
    pd.evaluate("(t)=>{ window.__fx.tables.user_prefs = t; }", table(pc)); pd.evaluate("()=>ARESync.pull()")
    check("5 新しい変更（NEW）が、古い端末の値（OLD）で上書きされない", ls(pd, "are_weather_place") == "NEW", ls(pd, "are_weather_place"))
    C.close(); D.close()
    # お試し（ゲスト）は同期しない
    G, pg, logsG = boot(p, guest=True)
    setls(pg, "are_theme", "light")
    pg.evaluate("()=>ARESync.flush()")
    check("6 お試し（ゲスト）は サーバーに送らない", not [r for r in table(pg) if r["key"][:3] in ("ls:","lc:")], table(pg))
    G.close()
    # 初回：ローカルにだけある値は、サーバーへ送られる（旧版からの引きつぎ）
    E, pe, logsE = boot(p, local={HK: '["r2"]'})
    pe.evaluate("()=>ARESync.flush()")
    keysE = [r["key"] for r in table(pe)]
    check("7 すでに端末にあった値が、初回にサーバーへ送られる", "ls:are_hidden_rooms" in keysE, keysE)
    E.close()
    errs = [l for l in (logsA + logsB + logsC + logsD) if l[0] == "pageerror"]
    check("8 画面エラーなし", not errs, errs[:2])
print("%d/%d" % (sum(res), len(res)))
