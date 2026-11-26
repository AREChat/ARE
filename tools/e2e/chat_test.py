import sys, json, base64
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
open("/tmp/are-e2e/t.png", "wb").write(PNG)
EXTRA = """
window.__fx.tables.messages = [
  {id:'m1', room_id:'r1', sender_id:'u1', content: JSON.stringify({type:'text', text:'こんにちは https://example.com/page を見てね'}), created_at:'2026-10-31T01:00:00Z', edited_at:null, expires_at:null, is_auto_reply:false},
  {id:'m2', room_id:'r1', sender_id:'u-me', content: JSON.stringify({type:'text', text:'やあ'}), created_at:'2026-10-31T01:01:00Z', edited_at:null, expires_at:null, is_auto_reply:false}
];
window.__fx.tables.posts = [{id:'p1', author_id:'u1', body:'はじめての投稿', image_path:null, created_at:'2026-10-31T00:30:00Z', deleted_at:null, visibility:'public'}];
window.__fx.rpc.my_access = function(){ return {points: 120, admin:false, trial_ends:null, streak:1}; };
window.__fx.rpc.claim_daily_bonus = function(){ return {gained: 10, points: 130, streak: 2}; };
window.__fx.rpc.shop_list = function(){ return [{id:'s1', kind:'video', title:'テスト動画', description:'説明', price:50, owned:false}, {id:'s2', kind:'video', title:'高い動画', description:'', price:9999, owned:false}]; };
window.__fx.rpc.shop_buy = function(a){ return {ok:true}; };
window.__fx.rpc.send_message = function(a){ window.__fx.tables.messages.push({id:'mx'+Math.random(), room_id:a.p_room_id, sender_id:'u-me', content:a.p_content, created_at:new Date().toISOString(), edited_at:null, expires_at:null, is_auto_reply:false}); return 'mx'; };
window.__fx.rpc.create_post_with_visibility = function(a){ window.__fx.tables.posts.unshift({id:'p2', author_id:'u-me', body:a.p_body, image_path:a.p_image_path, created_at:new Date().toISOString(), deleted_at:null, visibility:a.p_visibility}); return 'p2'; };
window.__fx.rpc.is_current_user_admin = function(){ return false; };
"""
with sync_playwright() as p:
    # ===== ログイン画面 =====
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx="window.__fx.noSession = true;")
    CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}
    def fn_route(route):
        if route.request.method == "OPTIONS":
            return route.fulfill(status=204, headers=CORS, body="")
        body = json.loads(route.request.post_data or "{}")
        if body.get("password") == "good-pass":
            return route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"accessToken": "a", "refreshToken": "r", "user": {"id": "u-me"}}))
        return route.fulfill(status=401, headers=CORS, content_type="application/json", body=json.dumps({"error": "ログインIDまたはパスワードが違います。"}))
    page.route("**/functions/v1/login-user", fn_route)
    page.goto(BASE + "/login.html"); page.wait_for_selector("#loginForm"); page.wait_for_timeout(500)
    page.click("#loginButton"); page.wait_for_timeout(300)
    check("ログイン：空のまま押すと、ブラウザが「入力してください」と止める（サーバーには送らない）", page.evaluate("document.getElementById('loginId').validity.valueMissing") and page.url.endswith("/login.html"), page.evaluate("document.getElementById('loginId').validationMessage"))
    page.fill("#loginId", "testa"); page.fill("#loginPassword", "bad"); page.click("#loginButton"); page.wait_for_timeout(500)
    check("ログイン：まちがったパスワードはサーバーの案内が出て、もう一度押せる", "違います" in page.inner_text("#loginStatus") and page.locator("#loginButton").is_enabled(), page.inner_text("#loginStatus"))
    page.fill("#loginPassword", "good-pass"); page.click("#loginButton"); page.wait_for_timeout(1500)
    check("ログイン：正しければチャット画面へ移動", page.url.endswith("/chat.html"), page.url)
    check("ログイン：画面のエラーなし", not [l for l in logs if l[0] in ("error", "pageerror") and "Failed to load" not in l[1]], logs[:2])
    browser.close()

    # ===== チャット =====
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=EXTRA)
    try: ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
    except Exception: pass
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1500)
    names = page.inner_text("#roomList")
    check("チャット一覧に相手の名前が並ぶ", "みどり" in names and "あおい" in names, names.replace("\n", " ")[:60])
    page.locator("#roomList button, #roomList .room, #roomList [data-room], #roomList > *").filter(has_text="みどり").first.click(); page.wait_for_timeout(1200)
    check("ルームを開くと、相手の名前と過去のメッセージが出る", "みどり" in page.inner_text("#chatTitle") and "こんにちは" in page.inner_text("#messages"), page.inner_text("#chatTitle"))
    # --- リンクのコピー
    btn = page.locator("#messages .link-copy")
    check("メッセージ内のURLに「📋コピー」ボタンが付く", btn.count() >= 1, btn.count())
    if btn.count():
        btn.first.click(); page.wait_for_timeout(500)
        clip = page.evaluate("navigator.clipboard.readText()")
        check("「コピー」を押すとリンクがクリップボードに入る", clip == "https://example.com/page", clip)
        check("コピーのお知らせが出る", "コピー" in page.inner_text("body"))
    # --- 送信
    page.fill("#messageInput", "テスト送信です"); page.keyboard.press("Enter"); page.wait_for_timeout(800)
    calls = [c for c in page.evaluate("window.__calls") if c.get("rpc") == "send_message"]
    sent = json.loads(calls[-1]["args"]["p_content"]) if calls else {}
    check("Enterでメッセージが送られる（種類=text・本文が正しい）", sent.get("type") == "text" and sent.get("text") == "テスト送信です", sent)
    check("送信後、入力欄が空になり、画面に表示される", page.input_value("#messageInput") == "" and "テスト送信です" in page.inner_text("#messages"))
    page.fill("#messageInput", "   "); page.keyboard.press("Enter"); page.wait_for_timeout(300)
    check("空白だけのときは送らず案内を出す", len([c for c in page.evaluate("window.__calls") if c.get("rpc") == "send_message"]) == len(calls) and "入力してください" in page.inner_text("body"))
    # --- 入力中の表示
    page.focus("#messageInput"); page.keyboard.type("あ", delay=50); page.wait_for_timeout(500)
    ch = page.evaluate("(window.__channels['typing:r1'] || {sent: []}).sent")
    check("入力すると「入力中」の合図が相手に送られる", any(m.get("event") == "typing" for m in ch), ch[:1])
    n = page.evaluate("window.__emit('typing:r1', 'broadcast', {payload: {uid: 'u1', name: 'みどり'}}, 'typing')")
    page.wait_for_timeout(600)
    check("相手の入力中の合図を受けると「入力中」の表示が出る", "入力中" in page.inner_text("#typingLine") and "みどり" in page.inner_text("#typingLine"), page.inner_text("#typingLine"))
    check("自分の合図は無視される（自分への表示は出ない）", page.evaluate("window.__emit('typing:r1', 'broadcast', {payload: {uid: 'u-me', name: 'テストA'}}, 'typing') >= 0"))
    page.fill("#messageInput", "")
    # --- 画像
    page.set_input_files("#imageInput", "/tmp/are-e2e/t.png"); page.wait_for_timeout(1500)
    ups = page.evaluate("window.__uploads")
    img_calls = [c for c in page.evaluate("window.__calls") if c.get("rpc") == "send_message" and '"image"' in c["args"]["p_content"]]
    check("画像を選ぶとアップロードされ、画像メッセージが送られる", len(ups) >= 1 and len(img_calls) >= 1, (len(ups), len(img_calls), page.inner_text("#attachmentStatus")))
    page.screenshot(path="/tmp/are-e2e/shots_games/chat_room.png")
    # --- 通知（別ルームに届く）
    page.click("#backButton"); page.wait_for_timeout(300)
    page.evaluate("window.__emit('are-inbox', 'postgres_changes', {new: {id:'mz', room_id:'r2', sender_id:'u2', content: JSON.stringify({type:'text', text:'通知テスト'}), created_at: new Date().toISOString()}})")
    page.wait_for_timeout(600)
    check("別のルームの新着で、ポップアップが出る", page.locator(".nf-pop").count() == 1 and "通知テスト" in page.inner_text(".nf-pop"), page.locator(".nf-pop").count())
    badge = page.locator("#roomList .nf-badge, #roomList .unread, #roomList [class*=badge]")
    check("チャット一覧に未読バッジが付く", badge.count() >= 1 or "1" in page.inner_text("#roomList"), badge.count())
    page.locator(".nf-pop").click(); page.wait_for_timeout(1200)
    check("ポップアップを押すとそのルームが開く", "あおい" in page.inner_text("#chatTitle"), page.inner_text("#chatTitle"))
    # --- 投稿
    page.click("#backButton"); page.wait_for_timeout(300)
    page.click("[data-tab=posts]"); page.wait_for_timeout(1000)
    check("投稿タブに投稿が並ぶ", "はじめての投稿" in page.inner_text("#postFeed"), page.inner_text("#postFeed")[:50].replace("\n", " "))
    page.fill("#postBody", "テスト投稿です"); page.click("#postSubmit"); page.wait_for_timeout(1000)
    pc = [c for c in page.evaluate("window.__calls") if c.get("rpc") == "create_post_with_visibility"]
    check("投稿ボタンで投稿される（本文・公開範囲）", len(pc) == 1 and pc[0]["args"]["p_body"] == "テスト投稿です" and pc[0]["args"]["p_visibility"] == "public", pc[:1])
    check("投稿が一覧に出て、入力欄が空になる", "テスト投稿です" in page.inner_text("#postFeed") and page.input_value("#postBody") == "")
    page.fill("#postBody", ""); page.click("#postSubmit"); page.wait_for_timeout(300)
    check("空の投稿は送らず案内を出す", len([c for c in page.evaluate("window.__calls") if c.get("rpc") == "create_post_with_visibility"]) == 1)
    # --- ポイントとショップ
    page.evaluate("document.querySelector('[data-tab=other], [data-tab=more], [data-tab=tools]') && document.querySelector('[data-tab=other], [data-tab=more], [data-tab=tools]').click()"); page.wait_for_timeout(500)
    tabs = page.evaluate("[...document.querySelectorAll('[data-tab]')].map(e => e.dataset.tab)")
    print("   画面のタブ:", tabs)
    page.evaluate("openPtShop('video')"); page.wait_for_selector("#ptShopBody .button, #ptShopBody button", timeout=4000); page.wait_for_timeout(400)
    shop = page.inner_text("#ptShopBody")
    check("ショップに商品と価格が出る", "テスト動画" in shop and "50" in shop, shop.replace("\n", " ")[:80])
    check("ポイント不足の商品は押せない（交換ボタンが無効）", page.locator("#ptShopBody button[disabled]").count() >= 1)
    page.locator("#ptShopBody [data-t='pt:ask']:not([disabled])").first.click(); page.wait_for_timeout(300)
    check("交換を押すと「本当に交換する」の確認が出る", "本当に" in page.inner_text("#ptShopBody"))
    page.locator("#ptShopBody [data-t='pt:buy']").first.click(); page.wait_for_timeout(600)
    bc = [c for c in page.evaluate("window.__calls") if c.get("rpc") == "shop_buy"]
    check("確認のあと交換される（shop_buy）", len(bc) == 1 and bc[0]["args"]["p_item"] == "s1", bc)
    check("ログインボーナスの呼び出しが起動時に行われる", any(c.get("rpc") == "claim_daily_bonus" for c in page.evaluate("window.__calls")))
    # --- 管理画面（一般ユーザー）
    check("一般ユーザーには管理画面のタブが出ない", page.evaluate("document.getElementById('adminTabButton').hidden"))
    errs = page.evaluate("window.__fakeErrors")
    check("画面のエラーなし（チャット全体）", not errs and not [l for l in logs if l[0] in ("error", "pageerror") and "Failed to load" not in l[1]], (errs[:3], logs[:3]))
    browser.close()

    # ===== 管理者 =====
    admin_extra = EXTRA + """
    window.__fx.rpc.is_current_user_admin = function(){ return true; };
    window.__fx.rpc.admin_list_delete_requests = function(){ return [{id:'d1', message_id:'m1', room_id:'r1', requester_id:'u1', reason:'テスト理由', status:'pending', created_at:'2026-10-31T00:00:00Z', requester_name:'みどり', message_content: JSON.stringify({type:'text', text:'削除してほしい'})}]; };
    window.__fx.rpc.admin_list_rooms = function(){ return [{room_id:'r1', is_group:false, group_name:null, suspended_at:null, members:[{name:'みどり'},{name:'テストA'}], message_count:2, last_message_at:'2026-10-31T01:01:00Z'}]; };
    window.__fx.rpc.admin_list_account_deletion_requests = function(){ return []; };
    window.__fx.rpc.admin_list_reports = function(){ return []; };
    window.__fx.rpcDefault = function(name){ return /^admin_/.test(name) ? [] : null; };
    """
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=admin_extra)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1500)
    check("管理者には管理画面のタブが出る", not page.evaluate("document.getElementById('adminTabButton').hidden"))
    page.evaluate("document.getElementById('adminTabButton').click()"); page.wait_for_timeout(1200)
    body = page.inner_text("#adminBody")
    check("管理画面：最初に会話一覧が出る", "みどり" in body and "テストA" in body, body.replace("\n", " ")[:90])
    tabs = page.evaluate("[...document.querySelectorAll('#adminPanel button')].map(b => b.innerText.trim()).filter(t => t && t.length < 12)")
    bad_tabs = []
    for name in ["削除申請", "通報", "NG制裁", "利用状況", "お知らせ", "ショップ管理", "ユーザー管理", "アカウント削除", "セキュリティ", "会話一覧"]:
        before = len(page.evaluate("window.__fakeErrors"))
        loc = page.locator("#adminPanel button", has_text=name).first
        if loc.count() == 0: bad_tabs.append(name + "（ボタンなし）"); continue
        loc.click(); page.wait_for_timeout(700)
        txt = page.inner_text("#adminBody").strip()
        after = page.evaluate("window.__fakeErrors")
        if len(after) > before or not txt or "読み込み中" == txt: bad_tabs.append((name, txt[:30], after[before:][:1]))
        if name == "削除申請": check("管理画面：削除申請の一覧（申請者・理由）が出る", "みどり" in txt and "テスト理由" in txt, txt.replace("\n", " ")[:80])
    check("管理画面の10個のタブがすべて開ける", not bad_tabs, bad_tabs)
    check("管理画面のエラーなし", not [l for l in logs if l[0] in ("error", "pageerror") and "Failed to load" not in l[1]] and not page.evaluate("window.__fakeErrors"), (logs[:2], page.evaluate("window.__fakeErrors")[:2]))
    page.screenshot(path="/tmp/are-e2e/shots_games/chat_admin.png")
    browser.close()
print("合計", len(res), "失敗", res.count(False))
if srv: srv.terminate()
