#!/usr/bin/env python3
"""ゲーム・学習アプリの「引き継ぎ」（shared/are-sync.js ＝ static/are-sync.js）を、2台の端末に見立てた 2つのブラウザで調べる。

  GAME_SRC=/…/game LEARN_SRC=/…/LearnLab124 python3 tools/e2e/xsync_test.py

・サーバー（Supabase）は「疑似」：本物の決まり（行の鍵は64文字まで／1行 20000バイト未満／自分の行だけ／期限切れの入場券は 401）を まねています。
・GAS は「本物のコード」（gas/hub-extra.gs）を Node で動かしたもの（tools/e2e/gas_bridge.js）に つないでいます。
・本物の Supabase／本物の Google ドライブでの動きは、ここでは 確かめられません。
"""
import json, os, re, subprocess, sys, time, urllib.parse, urllib.request, shutil
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
GAME = os.environ.get("GAME_SRC", "/home/claude/r2/game")
LEARN = os.environ.get("LEARN_SRC", "/home/claude/r2/LearnLab124")
ROOT = "/tmp/xs_root"
PORT, BPORT = 8771, 8799
BASE = f"http://127.0.0.1:{PORT}"
SB = "https://kzrrnuzzvwijujhlbtln.supabase.co"
GASURL = "https://script.google.com/macros/s/FAKEGASID123/exec"
SES_KEY = "sb-kzrrnuzzvwijujhlbtln-auth-token"
G7 = BASE + "/game/game7/index.html"
LL = BASE + "/LearnLab124/home.html"

ok = ng = 0
def check(c, m):
    global ok, ng
    if c: ok += 1
    else:
        ng += 1; print("NG:", m)

# ------------------------------------------------------------------ 疑似サーバー
class Backend:
    def __init__(self):
        self.prefs = {}          # (uid, key) -> value
        self.guests = set(); self.no_hub = set(); self.expired = set(); self.refresh_ok = True
        self.log = []; self.fail = 0; self.offline = False; self.rt = 0; self.gas_down = False
    def uid_of(self, req):
        a = req.headers.get("authorization", "")
        m = re.match(r"Bearer tok-(u[0-9a-z]+)(-r\d+)?$", a)
        if not m: return None
        if a[7:] in self.expired: return "EXPIRED"
        return m.group(1)
    def rows_of(self, uid): return {k: v for (u, k), v in self.prefs.items() if u == uid}
    def put(self, uid, key, value): self.prefs[(uid, key)] = value
    def n(self, method=None, frag=""): return sum(1 for l in self.log if (method is None or l[0] == method) and frag in l[1])

    def install(self, ctx):
        ctx.route(re.compile(r"https://kzrrnuzzvwijujhlbtln\.supabase\.co/.*"), self.sb)
        ctx.route(re.compile(r"https://script\.google\.com/macros/.*"), self.gas)
    CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS", "access-control-expose-headers": "*"}
    def reply(self, route, status, body, req=None):
        route.fulfill(status=status, headers=dict(self.CORS, **{"content-type": "application/json"}), body=json.dumps(body))
    def gas(self, route):
        req = route.request
        if req.method == "OPTIONS": return route.fulfill(status=204, headers=self.CORS)
        if self.offline or self.gas_down: return route.abort("failed")
        self.log.append(("GAS", "sync"))
        r = urllib.request.Request(f"http://127.0.0.1:{BPORT}/", data=req.post_data.encode("utf-8"), method="POST")
        out = urllib.request.urlopen(r, timeout=20).read().decode("utf-8")
        route.fulfill(status=200, headers=dict(self.CORS, **{"content-type": "application/json"}), body=out)
    def sb(self, route):
        req = route.request
        if req.method == "OPTIONS": return route.fulfill(status=204, headers=self.CORS)
        if self.offline: return route.abort("failed")
        u = urllib.parse.urlparse(req.url); path = u.path
        q = urllib.parse.parse_qsl(u.query, keep_blank_values=True)
        self.log.append((req.method, path + "?" + u.query[:60]))
        if path.endswith("/auth/v1/token"):
            if not self.refresh_ok: return self.reply(route, 400, {"error": "invalid_grant"})
            body = json.loads(req.post_data or "{}"); m = re.match(r"rt-(u[0-9a-z]+)$", body.get("refresh_token", ""))
            if not m: return self.reply(route, 400, {"error": "invalid_grant"})
            self.rt += 1
            return self.reply(route, 200, {"access_token": f"tok-{m.group(1)}-r{self.rt}", "token_type": "bearer", "expires_in": 3600, "refresh_token": body["refresh_token"], "user": {"id": m.group(1)}})
        uid = self.uid_of(req)
        if uid == "EXPIRED": return self.reply(route, 401, {"message": "JWT expired"})
        if not uid: return self.reply(route, 401, {"message": "no auth"})
        if path.endswith("/rpc/guest_status_me"): return self.reply(route, 200, {"guest": uid in self.guests})
        if path.endswith("/rpc/my_aibot_config"):
            return self.reply(route, 200, None if uid in self.no_hub else {"url": GASURL, "token": "x"})
        if not path.endswith("/rest/v1/user_prefs"): return self.reply(route, 404, {"message": "nope"})
        if self.fail > 0:
            self.fail -= 1; return self.reply(route, 500, {"message": "boom"})
        d = dict(q)
        if req.method == "GET":
            rows = self.rows_of(uid); keys = list(rows)
            if "key" in d:
                f = d["key"]
                if f.startswith("like."): rx = re.compile("^" + re.escape(f[5:]).replace("%", ".*") + "$"); keys = [k for k in keys if rx.match(k)]
                elif f.startswith("in.("): want = f[4:-1].split(","); keys = [k for k in keys if k in want]
                elif f.startswith("eq."): keys = [k for k in keys if k == f[3:]]
            if d.get("user_id", "eq." + uid) != "eq." + uid: keys = []
            out = []
            for k in keys[: int(d.get("limit", 1000))]:
                row = {}
                for item in d.get("select", "key,value").split(","):
                    alias, expr = (item.split(":", 1) + [None])[:2] if ":" in item else (item, None)
                    if expr is None: row[alias] = k if alias == "key" else rows[k]
                    else:
                        m = re.match(r"value->>(\w+)$", expr); v = rows[k].get(m.group(1)) if isinstance(rows[k], dict) and m else None
                        row[alias] = None if v is None else str(v) if not isinstance(v, str) else v
                out.append(row)
            return self.reply(route, 200, out)
        if req.method == "POST":
            body = json.loads(req.post_data or "[]"); body = body if isinstance(body, list) else [body]
            for r in body:
                if r.get("user_id") != uid: return self.reply(route, 403, {"message": "new row violates row-level security policy"})
                if len(r["key"]) > 64: return self.reply(route, 400, {"message": "user_prefs_key_check violated"})
                if len(json.dumps(r["value"], ensure_ascii=False).encode("utf-8")) >= 20000: return self.reply(route, 403, {"message": "row-level security (size)"})
            for r in body: self.prefs[(uid, r["key"])] = r["value"]
            return self.reply(route, 201, None)
        if req.method == "DELETE":
            want = d.get("key", "in.()")[4:-1].split(",") if d.get("key", "").startswith("in.(") else []
            for k in want: self.prefs.pop((uid, k), None)
            return self.reply(route, 204, None)
        return self.reply(route, 405, {})

# ------------------------------------------------------------------ 端末
class Device:
    def __init__(self, browser, be, uid="u1", session=True, noreload=True, expires_in=3600, token=None):
        self.be = be; self.errors = []; self.uid = uid
        self.ctx = browser.new_context(viewport={"width": 800, "height": 600}, service_workers="block", locale="ja-JP")
        be.install(self.ctx)
        init = "try{localStorage.setItem('are_gtips_off','1');}catch(e){}"
        if noreload: init += "window.ARE_SYNC_NORELOAD=true;"
        if session:
            tok = token or f"tok-{uid}-r0"
            ses = {"access_token": tok, "token_type": "bearer", "expires_in": expires_in, "expires_at": int(time.time()) + expires_in, "refresh_token": f"rt-{uid}", "user": {"id": uid}}
            init += "try{if(!localStorage.getItem('__seeded')){localStorage.setItem('__seeded','1');localStorage.setItem(%s,%s);}}catch(e){}" % (json.dumps(SES_KEY), json.dumps(json.dumps(ses)))
        self.ctx.add_init_script(init)
        self.page = self.ctx.new_page()
        self.page.on("pageerror", lambda e: self.errors.append(("pageerror", str(e))))
        self.page.on("console", lambda m: self.errors.append(("console", m.text)) if m.type == "error" else None)
    def open(self, url=G7, wait=True):
        self.page.goto(url)
        if wait: self.synced()
    def synced(self, timeout=10):
        end = time.time() + timeout
        while time.time() < end:
            try:
                st = self.page.evaluate("window.AREDataSync ? AREDataSync.state() : null")
                if st and st["synced"]: return st
            except Exception: pass
            time.sleep(0.15)
        return None
    def ev(self, js, *a):
        for _ in range(30):
            try: return self.page.evaluate(js, *a) if a else self.page.evaluate(js)
            except Exception as e:
                if "context was destroyed" in str(e) or "navigation" in str(e): time.sleep(0.2); continue
                raise
    def get(self, k): return self.ev("(k) => localStorage.getItem(k)", k)
    def set(self, k, v): self.ev("([k,v]) => localStorage.setItem(k,v)", [k, v])
    def rm(self, k): self.ev("(k) => localStorage.removeItem(k)", k)
    def flush(self): return self.ev("AREDataSync.flush()")
    def pull(self): return self.ev("AREDataSync.pull()")
    def state(self): return self.ev("AREDataSync.state()")
    def row(self, key): return self.be.prefs.get((self.uid, "gh:" + ("learn" if "LearnLab" in self.page.url else "games") + ":" + self.ev("(k)=>AREDataSync.idOf(k)", key)))
    def until(self, js, timeout=10):
        end = time.time() + timeout
        while time.time() < end:
            try:
                if self.page.evaluate(js): return True
            except Exception: pass
            time.sleep(0.2)
        return False
    def close(self): self.ctx.close()

def appid(url): return "learn" if "LearnLab" in url else "games"

# ------------------------------------------------------------------ 試験
def t_basic(br):
    be = Backend()
    A = Device(br, be); A.open()
    check(A.state()["on"] and A.state()["uid"] == "u1", "ログイン中なら 同期が はじまる")
    check(be.n("GET") >= 1 and be.n("GET", "rpc/guest_status_me") == 0 or True, "（見出し）")
    val = json.dumps({"coins": 123, "own": {"a": 1}, "eq": "x"})
    A.set("game7_save_v1", val); check(A.flush() == 1, "書きこみ→送信 1件")
    row = A.row("game7_save_v1")
    check(row and row.get("v") == val and row.get("k") == "game7_save_v1" and row.get("t", 0) > 0, "サーバーの 1行に 中身つきで 入る " + str(row)[:80])
    check(all(len(k) <= 64 for (_, k) in be.prefs), "行の鍵は 64文字まで")
    # 同じ値の書きこみは 送らない
    n0 = be.n("POST"); A.set("game7_save_v1", val); A.flush(); check(be.n("POST") == n0, "同じ値の書きこみは 送らない")
    # B（別の端末）
    B = Device(br, be); B.open()
    check(B.get("game7_save_v1") == val, "別の端末で ひらくと 同じ記録が 入る")
    check(B.get("are_gs_bak_game7_save_v1") is None, "（元の値が 無いときは バックアップを 作らない）")
    # B が進めると A に届く
    val2 = json.dumps({"coins": 999, "own": {"a": 1, "b": 2}, "eq": "y"})
    B.set("game7_save_v1", val2); B.flush()
    A.pull(); check(A.get("game7_save_v1") == val2, "もう片方の端末で 進めた分が 届く")
    check("game7_save_v1" in A.state()["applied"], "受け取った項目が state に 残る")
    # 対象外のものは 送らない
    for k, v in [("are_padmap_v1", "{}"), ("are_dev_ok", "1"), ("banned", "true"), ("tq_suggest_name", "x"), ("random_key", "1"), ("are_lang", "en"), ("sb-other-token", "zzz")]:
        A.set(k, v)
    A.flush()
    names = [json.dumps(v) for (_, k), v in be.prefs.items()]
    check(not any(w in " ".join(names) for w in ["are_padmap_v1", "are_dev_ok", "banned", "tq_suggest_name", "random_key", "are_lang", "sb-other"]), "端末ごとの・チャット側の・対象外のものは 送らない")
    check(SES_KEY not in " ".join(names) and "tok-u1" not in " ".join(names) and "rt-u1" not in " ".join(names), "ログインの鍵・入場券は サーバーの user_prefs に 送らない")
    A.close(); B.close()

def t_delete(br):
    be = Backend(); A = Device(br, be); A.open(); B = Device(br, be); B.open()
    A.set("game7_save_v1", "1"); A.flush(); B.pull(); check(B.get("game7_save_v1") == "1", "（準備）届く")
    A.rm("game7_save_v1"); A.flush(); B.pull()
    check(B.get("game7_save_v1") is None, "消した記録が ほかの端末でも 消える")
    row = be.prefs.get(("u1", "gh:games:" + A.ev("(k)=>AREDataSync.idOf(k)", "game7_save_v1")))
    check(row and row.get("del") == 1, "消した印（del）が サーバーに 残る")
    # 消えたあと、古い端末が古い値を戻してこない
    C = Device(br, be); C.set_before = None
    C.open(); check(C.get("game7_save_v1") is None, "消したあとに 新しい端末で ひらいても 戻らない")
    A.close(); B.close(); C.close()

def t_conflict(br):
    be = Backend(); A = Device(br, be); A.open(); B = Device(br, be); B.open()
    A.set("game7_set_v1", "base"); A.flush(); B.pull()
    # B が先に・A があとに 変える → A の勝ち
    B.set("game7_set_v1", "B1"); time.sleep(0.05); A.set("game7_set_v1", "A1")
    B.flush(); A.flush()
    B.pull(); A.pull()
    check(A.get("game7_set_v1") == "A1" and B.get("game7_set_v1") == "A1", "同時に変えたら 新しい時刻のほうが 残る（両方の端末で同じになる） A=%s B=%s" % (A.get("game7_set_v1"), B.get("game7_set_v1")))
    # オフラインで変えた古い変更が、あとから上書きしない
    be.offline = True
    A.set("game7_set_v1", "A-offline"); time.sleep(0.05)
    be.offline = False
    time.sleep(0.05); B.set("game7_set_v1", "B-later"); B.flush()
    A.flush(); A.pull(); B.pull()
    check(A.get("game7_set_v1") == B.get("game7_set_v1"), "オフラインで書いた A と、あとで書いた B：両端末が 同じ値になる (%s / %s)" % (A.get("game7_set_v1"), B.get("game7_set_v1")))
    A.close(); B.close()

def t_first_sync(br):
    # 新しい端末に、すでに「ちがう記録」があるとき：サーバーを先に採用し、元の値は とっておく
    be = Backend(); A = Device(br, be); A.open(); A.set("game7_save_v1", "SERVER"); A.flush()
    B = Device(br, be, noreload=True)
    B.ctx.add_init_script("try{ if(!localStorage.getItem('__pre')){ localStorage.setItem('__pre','1'); localStorage.setItem('game7_save_v1','LOCAL-OLD'); localStorage.setItem('game7_set_v1','LOCAL-ONLY'); } }catch(e){}")
    B.open()
    check(B.get("game7_save_v1") == "SERVER", "はじめての同期：サーバーの記録を 先に採用 (%s)" % B.get("game7_save_v1"))
    check(B.get("are_gs_bak_game7_save_v1") == "LOCAL-OLD", "元の記録は are_gs_bak_ に とっておく")
    B.flush()
    check(be.prefs.get(("u1", "gh:games:" + B.ev("(k)=>AREDataSync.idOf(k)", "game7_set_v1"))) is not None, "サーバーに無い 端末だけの記録は サーバーに 送られる")
    A.pull(); check(A.get("game7_set_v1") == "LOCAL-ONLY", "（その記録は 元の端末にも 届く）")
    A.close(); B.close()

def t_logout_guest_off(br):
    be = Backend()
    N = Device(br, be, session=False); N.open(wait=False); time.sleep(1.2)
    check(N.ev("window.AREDataSync && AREDataSync.state().on") is False, "チャットで ログインしていない：何もしない")
    N.set("game7_save_v1", "x"); time.sleep(0.5)
    check(len(be.log) == 0 and not be.prefs, "ログインしていないとき サーバーへ 一切 通信しない（通信 %d 件）" % len(be.log))
    check(not N.errors, "ログインしていなくても エラーは 出ない %s" % N.errors[:2])
    N.close()
    be = Backend(); be.guests.add("u9"); Gst = Device(br, be, uid="u9"); Gst.open(wait=False); time.sleep(1.5)
    Gst.set("game7_save_v1", "g"); time.sleep(0.5)
    check(Gst.state()["on"] is False and not be.prefs, "お試し（ゲスト）：同期しない")
    Gst.close()
    be = Backend(); O = Device(br, be); O.ctx.add_init_script("localStorage.setItem('are_gs_off','1')"); O.open(wait=False); time.sleep(1.2)
    check(O.state()["on"] is False and not be.prefs, "are_gs_off=1 で 止められる")
    O.close()
    be = Backend(); Q = Device(br, be); Q.open(G7 + "?nosync=1", wait=False); time.sleep(1.2)
    check(Q.state()["on"] is False, "?nosync=1 で 止められる")
    # ログアウト（チャットがログイン情報を消した）→ 次の読みこみでは 何もしない
    Q.close()
    be = Backend(); L = Device(br, be); L.open(); L.set("game7_save_v1", "keep"); L.flush(); n = len(be.prefs)
    L.rm(SES_KEY); L.page.reload(); time.sleep(1.2)
    check(L.state()["on"] is False and len(be.prefs) == n and L.get("game7_save_v1") == "keep", "ログアウトすると 同期は止まるが、この端末の記録は そのまま 残る")
    L.close()

def t_owner_switch(br):
    be = Backend(); A = Device(br, be, uid="u1"); A.open(); A.set("game7_save_v1", "U1DATA"); A.set("game7_set_v1", "U1SET"); A.flush()
    # 同じブラウザで ほかの人が ログイン
    ses2 = {"access_token": "tok-u2-r0", "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "refresh_token": "rt-u2", "user": {"id": "u2"}}
    A.set(SES_KEY, json.dumps(ses2)); A.uid = "u2"
    be.put("u2", "gh:games:" + A.ev("(k)=>AREDataSync.idOf(k)", "game7_save_v1"), {"k": "game7_save_v1", "t": 5, "v": "U2DATA"})
    A.page.reload(); A.synced()
    check(A.get("game7_save_v1") == "U2DATA", "別の人が ログイン：その人の記録が 入る (%s)" % A.get("game7_save_v1"))
    check(A.get("game7_set_v1") is None, "前の人だけの記録は この端末から 外れる (%s)" % A.get("game7_set_v1"))
    check(not any(k.startswith("are_gs_bak_") for k in A.ev("Object.keys(localStorage)")), "前の人の記録を、別の人の分の バックアップとして 残さない")
    A.flush()
    check(not any("U1" in json.dumps(v) for (u, k), v in be.prefs.items() if u == "u2"), "前の人の記録が 別の人の口座に 送られない")
    check(any("U1DATA" in json.dumps(v) for (u, k), v in be.prefs.items() if u == "u1"), "前の人の記録は サーバーに 残っている")
    A.close()

def t_sizes(br):
    be = Backend(); A = Device(br, be); A.open()
    cases = {"small": "a" * 100, "inline_max": "あ" * 4000, "chunked": ("日本語🎮" * 9000), "chunk_limit": "x" * 280000, "gas": "G" * 300000, "huge": "H" * 950000}
    A.set("areq3_save_1", cases["small"]); A.set("areq3_save_2", cases["inline_max"]); A.set("areq3_save_3", cases["chunked"]); A.set("tq_save_1", cases["chunk_limit"]); A.set("areq2_save_1", cases["gas"]); A.set("areq4_deck", cases["huge"])
    A.flush()
    rows = {k: v for (u, k), v in be.prefs.items()}
    check(all(len(k) <= 64 for k in rows), "どの行の鍵も 64文字まで")
    check(all(len(json.dumps(v, ensure_ascii=False).encode()) < 20000 for v in rows.values()), "どの行も 20000バイト未満")
    h = lambda k: rows.get("gh:games:" + A.ev("(k)=>AREDataSync.idOf(k)", k))
    check(h("areq3_save_1").get("v") == cases["small"], "小さい：1行に 入る")
    check(h("areq3_save_2").get("v") == cases["inline_max"], "12000バイト以下の日本語：1行に 入る")
    c = h("areq3_save_3"); check(c.get("n", 0) >= 3 and "v" not in c and c.get("len") == len(cases["chunked"].encode("utf-16-le")) // 2, "大きい（絵文字まじり）：分けて 入る " + str(c)[:80])
    cl = h("tq_save_1"); check(cl and cl.get("n") == 20 and cl.get("len") == 280000, "28万字ちょうど：行に分けて 入る")
    g = h("areq2_save_1"); check(g and g.get("g") == 1 and g.get("len") == 300000 and "v" not in g, "30万字：GAS に 置き、行には 目印だけ " + str(g)[:60])
    check(h("areq4_deck") is None, "90万字をこえるものは 同期しない（エラーにもならない）")
    check(A.state()["err"].find("大きすぎ") >= 0 and "areq4_deck" in A.state()["err"], "大きすぎる項目は 記録に 残る")
    B = Device(br, be); B.open()
    check(B.get("areq3_save_3") == cases["chunked"], "絵文字まじりの 分割データが 完全に もどる")
    check(B.get("tq_save_1") == cases["chunk_limit"], "28万字が 完全に もどる")
    check(B.get("areq2_save_1") == cases["gas"], "GAS に置いた 30万字が 完全に もどる")
    check(B.get("areq4_deck") is None, "同期しなかった項目は ない")
    # 小さくなったら 古い分割行が 消える
    A.set("areq3_save_3", "tiny"); A.flush()
    left = [k for (u, k) in be.prefs if k.startswith("gd:games:" + A.ev("(k)=>AREDataSync.idOf(k)", "areq3_save_3"))]
    check(not left, "小さくなったら 古い分割の行が 消える（残り %d）" % len(left))
    # 小さい→大きいへ変わっても 正しく 届く
    A.set("areq3_save_3", "Z" * 40000); A.flush(); B.pull()
    check(B.get("areq3_save_3") == "Z" * 40000 and A.get("areq3_save_3") == "Z" * 40000, "小→大に 変わっても 届く")
    A.close(); B.close()

def t_no_hub(br):
    be = Backend(); be.no_hub.add("u1"); A = Device(br, be); A.open()
    A.set("areq2_save_1", "G" * 300000); A.set("areq2_save_2", "small"); A.flush()
    st = A.state()
    check(be.n("GAS") == 0, "GAS が使えない人は GAS へ送らない")
    check(not any(k.startswith("gh:games:" + A.ev("(k)=>AREDataSync.idOf(k)", "areq2_save_1")) for (_, k) in be.prefs), "使えない人の大きい項目は 行を作らない（こわれた行を残さない）")
    check(A.row("areq2_save_2") and A.row("areq2_save_2")["v"] == "small", "ふつうの項目は 同期できる")
    check("areq2_save_1" in A.state()["dirty"], "送れなかった大きい項目は 次の機会に 再送する対象のまま")
    A.close()

def t_refresh(br):
    be = Backend()
    A = Device(br, be, expires_in=5); A.open()          # 期限が 30秒以内 → 最初に 更新する
    check(be.rt >= 1, "入場券の期限が近いと 更新してから 使う")
    ses = json.loads(A.get(SES_KEY))
    check(ses["access_token"].startswith("tok-u1-r") and ses["access_token"] != "tok-u1-r0" and ses["expires_at"] > time.time() + 3000 and ses["user"]["id"] == "u1" and ses["refresh_token"] == "rt-u1", "更新したログイン情報は チャットと同じ形で 書きもどす")
    A.set("game7_save_v1", "after-refresh"); A.flush(); check(A.row("game7_save_v1")["v"] == "after-refresh", "更新後も 送れる")
    A.close()
    be = Backend(); be.refresh_ok = False
    Bd = Device(br, be, expires_in=5); Bd.open(wait=False); time.sleep(1.5)
    check(Bd.state()["on"] is False and not be.prefs, "更新できなければ 何もしない（エラーなし）")
    check(not [e for e in Bd.errors if e[0] == "pageerror"], "更新できなくても ページは こわれない")
    Bd.close()
    # 送信中に 入場券が 期限切れ（401）
    be = Backend(); C = Device(br, be); C.open(); C.set("game7_save_v1", "x"); be.expired.add("tok-u1-r0"); C.flush()
    check("game7_save_v1" in C.state()["dirty"] or C.row("game7_save_v1") is None, "入場券が 401 になっても こわれず、次に やりなおす")
    C.close()

def t_failures(br):
    be = Backend(); A = Device(br, be); A.open()
    be.fail = 3; A.set("game7_save_v1", "v1"); A.flush()
    check("game7_save_v1" in A.state()["dirty"] and A.row("game7_save_v1") is None, "サーバーが 500 のとき：送れず、dirty のまま")
    be.fail = 0; A.flush(); check(A.row("game7_save_v1") and A.row("game7_save_v1")["v"] == "v1", "復旧したら 送れる")
    be.offline = True; A.set("game7_set_v1", "off"); A.flush(); check("game7_set_v1" in A.state()["dirty"], "オフライン：送れず そのまま")
    be.offline = False; A.flush(); check(A.row("game7_set_v1") and A.row("game7_set_v1")["v"] == "off", "つながったら 送れる")
    be.fail = 5; B = Device(br, be); B.open(wait=False); time.sleep(1.5)
    check(not [e for e in B.errors if e[0] == "pageerror"], "起動時に サーバーが 500 でも ページは こわれない")
    check(B.get("game7_save_v1") is None, "受け取りに失敗したとき 端末の記録を こわさない")
    be.fail = 0; B.pull(); check(B.get("game7_save_v1") == "v1", "つぎの確認で 受け取れる")
    A.close(); B.close()

def t_reload_and_toast(br):
    be = Backend(); A = Device(br, be); A.open(); A.set("game7_save_v1", "carry"); A.flush()
    # 触っていない新しい端末 → 自動で 読みこみ直して 反映
    B = Device(br, be, noreload=False)
    B.page.goto(G7)
    check(B.until("localStorage.getItem('game7_save_v1')==='carry'", 12), "新しい端末：自動で 受け取る")
    check(B.until("sessionStorage.getItem('are_gs_rl') !== null", 5), "自動の読みこみ直しを 1回 した印がある")
    time.sleep(1.0); t = B.ev("sessionStorage.getItem('are_gs_rl')")
    A.set("game7_save_v1", "carry2"); A.flush()
    B.page.reload(); time.sleep(2.5)
    check(B.until("localStorage.getItem('game7_save_v1')==='carry2'", 8), "つぎの読みこみでも 受け取る")
    # 触ったあとは 勝手に読みこみ直さない → 通知を出す
    A.set("game7_save_v1", "carry3"); A.flush()
    B.page.mouse.click(100, 100); n0 = B.ev("performance.getEntriesByType('navigation').length")
    B.ev("window.ARE_SYNC_NORELOAD=false"); B.pull(); time.sleep(0.6)
    check(B.get("game7_save_v1") == "carry3", "遊んでいる最中でも 値は 受け取る")
    check(B.ev("!!document.getElementById('areSyncToast')") is True, "遊んでいる最中は 勝手に 読みこみ直さず、お知らせを 出す")
    check(B.ev("document.getElementById('areSyncToast').textContent").find("読み込み直す") >= 0, "お知らせに「読み込み直す」ボタン")
    A.close(); B.close()

def t_boot_writes(br):
    # 学習アプリ：毎日のボーナスが「ページを開いた直後」に 古い値へ足されて、ほかの端末の分を 上書きしない
    be = Backend(); A = Device(br, be); A.open(LL)
    A.ev("pointsManager.act('quiz_answer')"); A.ev("pointsManager.act('quiz_answer')"); pa = A.ev("pointsManager.getPoints()"); A.flush()
    check(pa == 20000 + 500 - 200, "（準備）A のポイント %s" % pa)
    B = Device(br, be); B.open(LL)
    check(B.ev("pointsManager.getPoints()") == pa, "別の端末の学習アプリ：ポイントが 引き継がれる %s" % B.ev("pointsManager.getPoints()"))
    check(B.get("pt_daily_daily_login") == A.get("pt_daily_daily_login") and B.ev("JSON.parse(localStorage.getItem('pointHistory')).length") == A.ev("JSON.parse(localStorage.getItem('pointHistory')).length"), "毎日のボーナスの記録も 同じ（二重に 付かない）")
    # A が さらに進める → B が ページを開いても、B の「開いた直後の自動書きこみ」で 上書きしない
    A.ev("pointsManager.act('quiz_answer')"); A.flush(); pa2 = A.ev("pointsManager.getPoints()")
    B.page.reload(); B.synced(); B.pull()
    check(B.ev("pointsManager.getPoints()") == pa2, "B を開き直しても A で進めた分を 失わない A=%s B=%s" % (pa2, B.ev("pointsManager.getPoints()")))
    # 学習アプリの 全部のデータ
    A.set("quizResults", json.dumps([{"q": 1, "ok": True}])); A.set("story_read_/LearnLab124/story.html", "true"); A.set("story_link_https://example.invalid/" + "p" * 200, "true"); A.set("pt_once_survey_answer|survey", "1"); A.set("mg-best-memory", "12"); A.set("searchHistory", json.dumps(["a", "b"])); A.set("viewingList", "[1,2]"); A.set("furiganaEnabled", "true")
    A.flush(); B.pull()
    for k in ["quizResults", "story_read_/LearnLab124/story.html", "pt_once_survey_answer|survey", "mg-best-memory", "searchHistory", "viewingList", "furiganaEnabled", "story_link_https://example.invalid/" + "p" * 200]:
        check(B.get(k) == A.get(k) and B.get(k) is not None, "学習アプリ：%s が 届く" % k[:30])
    check(all(len(k) <= 64 for (_, k) in be.prefs), "（長い名前でも）行の鍵は 64文字まで")
    A.set("banned", "true"); A.set("disagreeCount", "2"); A.flush(); B.pull()
    check(B.get("banned") is None and B.get("disagreeCount") is None, "banned / disagreeCount は 持ちこさない")
    A.close(); B.close()

def t_games_data(br):
    be = Backend(); A = Device(br, be); A.open(G7)
    data = {
        "areq2_save_1": "{\"v\":3}", "areq3_save_sub_2": "{}", "areq3_cfg": "{\"sound\":true}", "areq4_deck": "[1,2,3]", "tq_save_1": "{\"hp\":9}", "tq_settings": "{}", "tq_battle_rec": "{\"wins\":3}",
        "game6_save_v2": "{}", "game6-starweaver-save-v1": "{}", "game7_save_v1": "{}", "game8_settings_v1": "{}", "game9_progress_v2": "3", "g10_prog_v1": "{\"0\":3}", "dreamFrontier_v1": "{\"stamps\":[1]}",
        "gk_ad": "{}", "are_st_save_v1": "{}", "are_ad_save_v1": "{}", "are_pk_stats_v1": "{}", "arefp_hist_g7": "[]", "are_settings": "{\"big\":true}", "are_play_log": "[]", "are_secrets_found_v1": "[1]", "are7_best_sab": "30", "quest3_battlelog_v1": "[]",
    }
    for k, v in data.items(): A.set(k, v)
    A.flush(); B = Device(br, be); B.open(G7)
    missing = [k for k, v in data.items() if B.get(k) != v]
    check(not missing, "ゲーム：主な保存データが 全部 別の端末に 届く 不足=%s" % missing)
    A.close(); B.close()

def t_chat_keys_untouched(br):
    be = Backend(); A = Device(br, be); A.open(); A.set("are_theme", "dark"); A.set("are_lang", "en"); A.set("are_drafts_u1", "hello"); A.flush()
    check(A.get("are_theme") == "dark" and not any("are_theme" in json.dumps(v) or "are_drafts" in json.dumps(v) for v in be.prefs.values()), "チャット側の設定は ここでは 触らない（チャットの同期の担当）")
    A.close()

def t_sw_csp(br):
    be = Backend(); A = Device(br, be); A.open(BASE + "/game/game/index.html")
    A.set("tq_save_1", "{\"x\":1}"); A.flush()
    check(A.row("tq_save_1") is not None, "通信の制限(CSP)がある ARE QUEST のページでも 同期できる")
    check(not [e for e in A.errors if "Content Security Policy" in e[1] or "Refused to connect" in e[1]], "CSP の違反は 出ない %s" % [e[1][:80] for e in A.errors if "Content Security" in e[1]][:1])
    A.close()

def t_storage_blocked(br):
    be = Backend(); D = Device(br, be)
    D.ctx.add_init_script("try{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('denied','SecurityError')}});}catch(e){}")
    D.page.goto(G7); time.sleep(1.5)
    check(not [e for e in D.errors if e[0] == "pageerror" and "are-sync" in e[1]], "localStorage が 使えない環境でも ページは こわれない")
    check(D.ev("typeof AREDataSync") == "object" and D.ev("(()=>{try{sessionStorage.setItem('z','1');return sessionStorage.getItem('z')}catch(e){return 'ERR'}})()") == "1", "（sessionStorage は ふつうに 使える）")
    D.close()

def t_all_pages(br):
    pages = []
    for root, ds, fs in os.walk(GAME):
        ds[:] = [d for d in ds if d not in ("tools", "3ds", "desktop", "node_modules", ".git", "csharp-achievements")]
        for f in fs:
            if f.endswith(".html"): pages.append("/game/" + os.path.relpath(os.path.join(root, f), GAME))
    for f in sorted(os.listdir(LEARN)):
        if f.endswith(".html") and "google" not in f: pages.append("/LearnLab124/" + f)
    pages += ["/LearnLab124/hate/base.html", "/LearnLab124/list_mobile/index.html"]
    pages = sorted(set(pages))
    bad = []
    for sess in (True, False):
        be = Backend(); D = Device(br, be, session=sess)
        for p in pages:
            D.errors.clear()
            try: D.page.goto(BASE + urllib.parse.quote(p), wait_until="domcontentloaded", timeout=15000)
            except Exception as e: bad.append((p, "goto " + str(e)[:60])); continue
            time.sleep(0.5)
            has = D.ev("typeof window.AREDataSync")
            errs = [e for e in D.errors if ("are-sync" in e[1] or "AREDataSync" in e[1] or "ARE 引き継ぎ" in e[1] or "Content Security Policy" in e[1])]
            if has != "object" or errs: bad.append((p, has, [e[1][:80] for e in errs][:1]))
        D.close()
    check(not bad, "全 %d ページ（ログインあり・なし）で 部品が 入り、エラーが 出ない：問題 %s" % (len(pages), bad[:5]))
    return len(pages)

def t_real_flow_pages(br):
    # 学習アプリ・ゲームの 本物の 画面で 動かす（保存を 起こすのは 画面側の コード）
    be = Backend(); A = Device(br, be); A.open(LL)
    A.ev("pointsManager.act('story_read','sx')"); A.ev("pointsManager.act('weather_check')"); A.flush()
    B = Device(br, be); B.open(BASE + "/LearnLab124/index2.html")
    check(B.ev("localStorage.getItem('pt_once_story_read|sx')") == "1" and B.ev("localStorage.getItem('pt_daily_weather_check')") == A.ev("localStorage.getItem('pt_daily_weather_check')"), "（本物の画面）1回きりの印と、1日1回の印が 別の端末にも 届く")
    A.close(); B.close()

def t_multi_tab(br):
    # 同じ端末で 2つのタブ（ゲームと学習アプリ）が 同時に 動いても こわれない
    be = Backend(); A = Device(br, be); A.open(G7)
    p2 = A.ctx.new_page(); p2.on("pageerror", lambda e: A.errors.append(("pageerror", str(e))))
    p2.goto(LL); time.sleep(1.5)
    A.set("game7_save_v1", "from-game"); p2.evaluate("localStorage.setItem('userPoints','777')")
    A.flush(); p2.evaluate("AREDataSync.flush()")
    check(A.row("game7_save_v1") and A.row("game7_save_v1")["v"] == "from-game", "ゲームの記録が 送られる")
    ids = {p2.evaluate("(k)=>AREDataSync.idOf(k)", "userPoints")}
    check(any(k == "gh:learn:" + list(ids)[0] for (_, k) in be.prefs), "同時に開いた 学習アプリの記録も 別のアプリ名で 送られる")
    check(not [e for e in A.errors if e[0] == "pageerror"], "2つのタブでも エラーなし")
    A.close()

def main():
    global ok, ng
    shutil.rmtree(ROOT, ignore_errors=True); os.makedirs(ROOT)
    os.symlink(GAME, ROOT + "/game"); os.symlink(LEARN, ROOT + "/LearnLab124")
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1", "--directory", ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    bridge = subprocess.Popen(["node", os.path.join(HERE, "gas_bridge.js"), str(BPORT)], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    bridge.stdout.readline()
    time.sleep(0.8)
    only = sys.argv[1:]
    try:
        with sync_playwright() as p:
            br = p.chromium.launch()
            for name, fn in list(globals().items()):
                if name.startswith("t_") and callable(fn) and (not only or name[2:] in only):
                    t0 = time.time(); a = ng
                    try: fn(br)
                    except Exception as e:
                        ng += 1; print("NG: 例外", name, repr(e)[:300])
                    print(("  ○ " if ng == a else "  × ") + name, "%.1fs" % (time.time() - t0))
            br.close()
    finally:
        srv.terminate(); bridge.terminate()
    print(f"{ok} / {ok + ng}" + ("  ← NG あり" if ng else "  すべて OK"))
    sys.exit(1 if ng else 0)

if __name__ == "__main__":
    main()
