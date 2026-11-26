import json, subprocess, time, os, sys, urllib.request
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get("ARE_SRC", os.path.abspath(os.path.join(HERE, "..", "..")))
os.makedirs("/tmp/are-e2e/shots_games", exist_ok=True)
PORT = int(os.environ.get("ARE_PORT", "8765"))
BASE = f"http://127.0.0.1:{PORT}"

def ensure_server():
    try:
        urllib.request.urlopen(BASE + "/index.html", timeout=2)
        return None
    except Exception:
        p = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1", "--directory", SRC],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(40):
            time.sleep(0.2)
            try:
                urllib.request.urlopen(BASE + "/index.html", timeout=2); break
            except Exception:
                pass
        return p

FAKE_JS = open(os.path.join(HERE, "fake-supabase.js"), encoding="utf-8").read()

def fixtures_js(extra=""):
    names = {"u1": "みどり", "u2": "あおい", "u3": "そら", "u4": "ゆめ", "u5": "はる", "u6": "りく", "u7": "ことり", "u8": "あかり"}
    profiles = [{"id": "u-me", "display_name": "テストA", "login_id": "testa"}] + [
        {"id": k, "display_name": v, "login_id": "id_" + k} for k, v in names.items()]
    rooms = [
        {"id": "r1", "is_group": False, "name": None, "created_by": "u-me", "created_at": "2026-10-30T00:00:00Z"},
        {"id": "r2", "is_group": False, "name": None, "created_by": "u2", "created_at": "2026-10-29T00:00:00Z"},
    ]
    members = [
        {"room_id": "r1", "user_id": "u-me"}, {"room_id": "r1", "user_id": "u1"},
        {"room_id": "r2", "user_id": "u-me"}, {"room_id": "r2", "user_id": "u2"},
    ]
    follows = [{"follower_id": "u-me", "followee_id": "u3"}]
    return ("window.__fx = {user:{id:'u-me',email:'me@example.invalid'}, tables:" + json.dumps({
        "profiles": profiles, "chat_rooms": rooms, "chat_room_members": members, "follows": follows}, ensure_ascii=False)
        + ", rpc:{}};\n" + extra + "\n")

def new_page(p, width=390, height=700, extra_fx="", touch=True, neutral_console=True):
    browser = getattr(p, os.environ.get('ARE_ENGINE', 'chromium')).launch()
    ctx = browser.new_context(viewport={"width": width, "height": height}, has_touch=touch, is_mobile=touch, locale="ja-JP", service_workers=os.environ.get("ARE_SW", "allow"))
    if neutral_console: ctx.add_init_script("console.debug=function(){}")   # 自動操作ツールがコンソールの中身を読む＝見張りのおとりに反応するのを防ぐ
    ctx.add_init_script(fixtures_js(extra_fx))
    if os.environ.get('ARE_TIPS') != 'on': ctx.add_init_script("try{localStorage.setItem('are_tips_off_u-me','1');localStorage.setItem('are_gtips_off','1');localStorage.setItem('ll_tips_off','1')}catch(e){}")
    if os.environ.get('ARE_HDR') != 'on': ctx.add_init_script("try{localStorage.setItem('are_install_taps','3')}catch(e){}")   # 「アプリ化のお願い」の全画面が、テストのクリックをさえぎらないように（ARE_HDR=on で、出す）
    ctx.add_init_script(FAKE_JS)
    page = ctx.new_page()
    logs = []
    page.on("console", lambda m: logs.append((m.type, m.text)) if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: logs.append(("pageerror", str(e))))
    def handler(route):
        try:
            url = route.request.url
            if url.startswith(BASE) or url.startswith("data:") or url.startswith("blob:"):
                return route.continue_()
            CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}
            if route.request.method == "OPTIONS":
                return route.fulfill(status=204, headers=CORS, body="")
            if url.endswith(".js") or "supabase.js" in url:
                return route.fulfill(status=200, headers=CORS, content_type="application/javascript", body="")
            return route.fulfill(status=200, headers=CORS, content_type="text/plain", body="")
        except Exception:
            pass   # ページを閉じたあとに残った通信（テスト道具側の競合）は無視する
    ctx.route("**/*", handler)
    if os.environ.get("ARE_HANG_FONTS"):
        import re as _re_h   # 会社のネットワークで Google フォントだけ返事が来ない場合の再現（返事をしないまま放置）
        ctx.route(_re_h.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda route: None)
    return browser, ctx, page, logs
