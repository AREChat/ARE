import sys, time
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
exec(open("call_test.py").read().split("with sync_playwright() as p:")[0])
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for mobile in (True, False):
        tag = "スマホ" if mobile else "PC"
        ctx, pg, lg = mkpage(b, "u-me", "", mobile=mobile)
        boot(pg); pg.wait_for_timeout(1200)
        pr = pg.evaluate("()=>{const p=state.currentPartner; return p?p.id:null}")
        def setp(status, ago_ms):
            pg.evaluate("([s,a])=>{const p=state.currentPartner; p.presence_status=s; p.last_seen_at=a===null?null:new Date(Date.now()-a).toISOString(); updateHeaderPresence(); renderRooms();}", [status, ago_ms])
            pg.wait_for_timeout(250)
        if mobile:
            bt = pg.evaluate("()=>document.getElementById('backButton').textContent.trim()")
            check(tag + " 1 戻るボタンは「←」だけ", bt == "←", bt)
        setp("online", 1000)
        r = pg.evaluate("()=>[document.getElementById('chatAvatar').dataset.pres, document.getElementById('chatSubtitle').innerText]")
        check(tag + " 2 オンライン：アイコンに online マーク・文字は「オンライン」", r[0] == "online" and "オンライン" in r[1], r)
        setp("offline", 7200000)
        r = pg.evaluate("()=>[document.getElementById('chatAvatar').dataset.pres, document.getElementById('chatSubtitle').innerText, getComputedStyle(document.getElementById('chatSubtitle')).display]")
        check(tag + " 3 オフライン：マークは offline、「最終…前」の文字は出ない", r[0] == "offline" and "最終" not in r[1] and r[1].strip() == "", r)
        setp("away", 1000)
        r = pg.evaluate("()=>document.getElementById('chatAvatar').dataset.pres")
        check(tag + " 4 退席中：away マーク", r == "away", r)
        setp("online", 1000)
        badge = pg.evaluate("""()=>{const a=document.getElementById('chatAvatar');const cs=getComputedStyle(a,'::after');const r=a.getBoundingClientRect();return {bg:cs.backgroundColor,w:cs.width,pos:cs.position,ov:getComputedStyle(a).overflow,aw:r.width}}""")
        check(tag + " 5 マークは右下に丸（緑）で出て、アイコンからはみ出して切れない", badge["pos"] == "absolute" and badge["ov"] == "visible" and "61, 220, 151" in badge["bg"], badge)
        rl = pg.evaluate("()=>[...document.querySelectorAll('#roomList .room-item')].map(b=>[b.querySelector('.avatar').textContent.trim().slice(0,2), b.querySelector('.avatar').dataset.pres||null])")
        solo = [x for x in rl if x[0] not in ("👥","📡")]
        grp = [x for x in rl if x[0] in ("👥","📡")]
        check(tag + " 6 左の一覧：個人のアイコンにマークがつき、グループにはつかない", len(solo) > 0 and all(x[1] for x in solo) and all(x[1] is None for x in grp), rl)
        pg.screenshot(path="/tmp/out/pres_%s.png" % ("m" if mobile else "pc"))
        # ヘッダーがせまい画面で、折り返さずに1段におさまる
        if mobile:
            hh = pg.evaluate("()=>document.querySelector('.chat-header').getBoundingClientRect().height")
            check(tag + " 7 上のバーが1段におさまる（高さ 90px 以下）", hh <= 90, hh)
        errs = [x for x in lg if x[0] == "pageerror"]
        check(tag + " 8 ページのエラーなし", not errs, errs[:2])
        ctx.close()
    # ---- ふだん 見ない 角度 ----
    ctx, pg, lg = mkpage(b, "u-me", "", mobile=True)
    boot(pg); pg.wait_for_timeout(1200)
    def setp2(status, seen_ago, extra=""):
        pg.evaluate("([s,a])=>{const p=state.currentPartner; p.presence_status=s; p.last_seen_at=a===null?null:(a==='bad'?'not-a-date':new Date(Date.now()-a).toISOString()); updateHeaderPresence();}", [status, seen_ago]); pg.wait_for_timeout(150)
    def hdr(): return pg.evaluate("()=>[document.getElementById('chatAvatar').dataset.pres||null, document.getElementById('chatSubtitle').innerText.trim()]")
    setp2("online", 3 * 60 * 1000); r = hdr(); check("9 オンライン表示でも 最後の通信が 2分より 古いと オフライン", r[0] == "offline" and r[1] == "", r)
    setp2("online", "bad"); r = hdr(); check("10 日時が こわれていても エラーなし・オフライン", r[0] == "offline" and not [x for x in lg if x[0] == "pageerror"], r)
    setp2("online", None); r = hdr(); check("11 last_seen_at が 空でも オフライン", r[0] == "offline", r)
    setp2("zzz", 1000); r = hdr(); check("12 しらない 状態は オフライン あつかい", r[0] == "offline", r)
    setp2("busy", 1000); r = hdr(); check("13 取り込み中：busy と 文字", r[0] == "busy" and "取り込み中" in r[1], r)
    setp2("away", 1000); r = hdr(); check("14 待機中：away と 文字", r[0] == "away" and "待機中" in r[1], r)
    # 管理者の 時間わり（日本時間・平日）
    pg.evaluate("""()=>{ window.__RD = Date; const real = Date;
      window.__setNow = (iso)=>{ const t = new real(iso).getTime(); const off = t - real.now(); window.Date = class extends real{ constructor(...a){ if(a.length) super(...a); else super(real.now()+off); } static now(){ return real.now()+off; } }; }; }""")
    ADM = "9d660098-27f5-4933-bdce-d0ea7a6f08b4"
    def adm(iso):
        pg.evaluate("(iso)=>{window.__setNow(iso); const p=state.currentPartner; window.__oldId=p.id; p.id='%s'; p.presence_status='offline'; p.last_seen_at=null; updateHeaderPresence();}" % ADM, iso); pg.wait_for_timeout(150); return hdr()
    for iso, lab in (("2026-11-24T02:00:00+09:00","火曜2時"),("2026-11-24T10:00:00+09:00","火曜10時"),("2026-11-28T10:00:00+09:00","土曜10時")):
        r = adm(iso); check("15 管理者は いつでも「取り込み中」（%s）：赤いマーク＋文字" % lab, r[0] == "busy" and "取り込み中" in r[1], r)
    pg.evaluate("()=>{window.Date = window.__RD; state.currentPartner.id = window.__oldId;}")
    # 部屋を きりかえ：グループ→個人でマークが のこらない
    rooms = pg.evaluate("()=>state.rooms.map(r=>[r.id,!!r.is_group,!!r.orphan])"); print("   rooms", rooms)
    pg.evaluate("()=>{const r=state.rooms.find(x=>!x.is_group&&!x.orphan); state.currentRoom=Object.assign({},r,{is_group:true,name:'ぐるーぷ',memberIds:['a','b']}); el.chatAvatar.textContent='👥'; updateHeaderPresence();}"); pg.wait_for_timeout(120)
    r = hdr(); check("18 グループの部屋では アイコンに マークが つかない・文字は メンバー数", r[0] is None and "メンバー" in r[1], r)
    # ながい 名前：1段に おさまる
    pg.evaluate("()=>{document.getElementById('chatTitle').textContent='あ'.repeat(60); }"); pg.wait_for_timeout(150)
    hh = pg.evaluate("()=>document.querySelector('.chat-header').getBoundingClientRect().height"); ow = pg.evaluate("()=>document.documentElement.scrollWidth-innerWidth")
    check("19 ながい 名前（60文字）でも 上のバーが のびすぎず、横に はみ出さない", hh < 140 and ow <= 1, (hh, ow))
    pg.screenshot(path="/tmp/out/pres_long.png")
    ctx.close()
    # 画像アイコン
    ctx, pg, lg = mkpage(b, "u-me", "", mobile=False)
    boot(pg); pg.wait_for_timeout(1000)
    pg.evaluate("()=>{const p=state.currentPartner; p.avatar_url='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><rect width=%2240%22 height=%2240%22 fill=%22%23c33%22/></svg>'; p.presence_status='online'; p.last_seen_at=new Date().toISOString(); setAvatar(el.chatAvatar,p); updateHeaderPresence();}"); pg.wait_for_timeout(300)
    info = pg.evaluate("()=>{const a=document.getElementById('chatAvatar');const i=a.querySelector('img');const cs=getComputedStyle(a,'::after');return {pres:a.dataset.pres,img:!!i,br:i&&getComputedStyle(i).borderRadius,bg:cs.backgroundColor,right:cs.right}}")
    check("20 写真アイコンでも マークが つく（写真は まるいまま）", info["pres"] == "online" and info["img"] and info["br"] in ("50%", "20px") and "61, 220, 151" in info["bg"], info)
    pg.screenshot(path="/tmp/out/pres_img.png", clip={"x": 300, "y": 0, "width": 700, "height": 110})
    ctx.close()
    b.close()
print("\n状態マークのテスト %d / %d" % (sum(res), len(res))); sys.exit(0 if all(res) else 1)
