"use strict";
// ===== すれ違いタウン：合いかぎ（iPhone の「ショートカット」や Android の自動化アプリから、位置を自動で知らせる。上級者向け）=====
// 仕組み（かんたんに）
//  ・「合いかぎ」は、画面で作ります（1人に1つ）。作った直後の1回だけ、この画面に出ます。サーバーには「暗号（ハッシュ）」しか残りません。
//  ・合いかぎで できるのは「いまここ（位置）を知らせる」ことだけ。メッセージ・プロフィール・ポイントなどには さわれません。
//  ・位置は、サーバーが受け取った瞬間に「ざっくりの区画の暗号」に変えます。緯度・経度は保存しません。
//  ・作りなおすと古いのは すぐ使えなくなります。「無効にする」でも消せます。「記録をぜんぶ消す」でも消えます。
//  ・この画面の中に持つ合いかぎは、作った直後だけです（このアプリには保存しません。10分で忘れます）。
const pbk = {key:"", exp:0, timer:0, st:null};

const pbkEndpoint = () => String((window.ARE_CONFIG || {}).supabaseUrl || "").replace(/\/+$/, "") + "/rest/v1/rpc/passby_key_ping_v1";
const pbkPublicKey = () => String((window.ARE_CONFIG || {}).supabasePublishableKey || "");   // 公開してよい鍵（アプリの画面に もともと入っているもの）
function pbkForget(){ clearTimeout(pbk.timer); pbk.timer = 0; pbk.key = ""; pbk.exp = 0; }
function pbkRemember(k){ pbkForget(); pbk.key = k; pbk.exp = Date.now() + 10 * 60 * 1000; pbk.timer = setTimeout(pbkForget, 10 * 60 * 1000); }
function pbkSt(t){ const a = document.getElementById("pbkSt"); if(a) a.textContent = t; }

/** 「すれ違いの設定」の中に出す、小さなカード（くわしくは、押して開く） */
function pbKeyPanel(){
    pbkForget();
    return '<div class="admin-card"><b>🔑 自動でおくる（上級者向け）</b><div class="meta">iPhone の「ショートカット」や、Android の自動化アプリから、決まった時間に位置を自動で知らせます（無料）。専用の「合いかぎ」を使います。</div><div class="row"><button type="button" class="button-secondary" data-t="pb:keyopen">くわしく見る</button></div></div>';
}

const pbkCopyBtn = (k, label) => '<button type="button" class="button-secondary" data-t="pb:keycopy" data-k="' + k + '">' + (label || "コピー") + '</button>';
const pbkField = (id, label, value, k) =>
    '<label for="' + id + '">' + label + '</label><div class="row pbk-field"><input id="' + id + '" type="text" readonly value="' + escapeHtml(value) + '" onfocus="this.select()" autocomplete="off" spellcheck="false">' + pbkCopyBtn(k) + '</div>';

async function openPbKey(){
    let st = null, err = "";
    try{ st = await pbRpc("passby_key_status_v1"); }
    catch(e){ err = pbMissing(e) ? "まだ使えません（サーバーの準備が終わっていません）。" : "読み込めませんでした。しばらくしてから、もう一度ひらいてください。"; }
    pbk.st = st;
    const has = !!(st && st.has_key);
    const live = !!(pbk.key && Date.now() < pbk.exp);
    const info = !st ? '<div class="meta">' + escapeHtml(err) + '</div>'
        : has ? '<div class="meta">作った日：' + escapeHtml(formatDateTime(st.created_at)) + '<br>さいごに使った日：' + (st.last_used_at ? escapeHtml(formatDateTime(st.last_used_at)) : "まだ使っていません") + '<br>使った回数：' + (Number(st.uses) || 0) + '回</div>'
        : '<div class="meta">合いかぎは、まだありません。</div>';
    const made = live
        ? '<div class="admin-card pbk-box" id="pbKeyBox"><b>✅ 合いかぎができました</b><div class="meta">いまだけ見られます。下の3つを、ショートカット（や自動化アプリ）に入れてください。この画面を閉じたあとは、もう見られません（わすれたら、作りなおします）。</div>' +
            pbkField("pbkKey", "合いかぎ（人に見せない）", pbk.key, "key") +
            pbkField("pbkUrl", "送り先のURL", pbkEndpoint(), "url") +
            pbkField("pbkApi", "ヘッダ apikey の値（公開キー）", pbkPublicKey(), "api") +
            '<div class="row"><button type="button" data-t="pb:keytest">いま試しに送ってみる</button>' + pbkCopyBtn("body", "本文（JSON）をコピー") + '</div>' +
            '<div class="meta" id="pbkSt" role="status" aria-live="polite"></div></div>'
        : "";
    openSheet(toolHead("🔑 自動でおくる", "上級者向け・無料") +
        '<div class="admin-card"><b>安全のために（かならず読んでください）</b><div class="meta pbk-list">' +
            '・合いかぎで できるのは「いまここを知らせる」だけです。メッセージを読んだり、送ったりはできません。<br>' +
            '・合いかぎは 1つだけ。作りなおすと、古いのは すぐ使えなくなります。<br>' +
            '・人に見せない・画面に写さない。ショートカットを人に渡すと、合いかぎも一緒に渡ります。見られたかも？と思ったら「無効にする」。<br>' +
            '・位置は、サーバーに届いた瞬間に「ざっくりの区画の暗号」に変えて、緯度・経度は保存しません。<br>' +
            '・20秒に1回までしか受けつけません。1日に数回で十分です（電池も大切に）。<br>' +
            '・位置のずれが大きい（1.5km より大きい）ときは、使われません。' +
        '</div></div>' +
        '<div class="admin-card"><b>いまの合いかぎ</b>' + info +
            (st ? '<div class="row"><button type="button" data-t="pb:keymake">' + (has ? "🔑 作りなおす" : "🔑 合いかぎを作る") + '</button>' + (has ? '<button type="button" class="button-danger" data-t="pb:keyrevoke">無効にする</button>' : "") + '</div>' : "") +
        '</div>' + made +
        '<details class="admin-card pbk-steps"><summary><b>📱 iPhone（ショートカット）の設定</b></summary><div class="meta pbk-list">' +
            '1. 「ショートカット」アプリ →下の「オートメーション」→右上の「＋」→「時刻」を選びます（例：朝8時・昼12時・夕方6時など、いくつか作ります）。<br>' +
            '2. 「すぐに実行」を選びます（「実行の前に尋ねる」は オフ）。<br>' +
            '3. 「新規の空のオートメーション」で、アクションを2つ足します：①「現在地を取得」 ②「URLの内容を取得」。<br>' +
            '4. 「URLの内容を取得」を開いて、「詳細」を押し、次のように入れます：<br>' +
            '　・URL：上の「送り先のURL」<br>' +
            '　・方法：POST<br>' +
            '　・ヘッダ：<code>apikey</code> ＝上の「公開キー」／<code>Content-Type</code> ＝ <code>application/json</code><br>' +
            '　・本文：JSON → <code>p_key</code>（テキスト）＝合いかぎ／<code>p_lat</code>（数字）＝「現在地」の緯度／<code>p_lng</code>（数字）＝「現在地」の経度<br>' +
            '5. 最初に位置情報の許可を聞かれたら「許可」。動かないときは「設定」→「プライバシーとセキュリティ」→「位置情報サービス」→「ショートカット」を見てください。<br>' +
            '6. ショートカットの「▶」で試して、結果に <code>"ok":true</code> と出れば成功です。' +
        '</div></details>' +
        '<details class="admin-card pbk-steps"><summary><b>🤖 Android（自動化アプリ）の設定</b></summary><div class="meta pbk-list">' +
            '1. 自動化アプリを入れます（MacroDroid・Tasker・HTTP Shortcuts など。無料の範囲で使えるものを選んでください）。<br>' +
            '2. 決まった時間に動く「きっかけ（時刻）」を作ります。<br>' +
            '3. 動作は「現在地を取得」→「HTTPリクエスト（POST）を送る」の順にします。<br>' +
            '4. 送り先のURL・ヘッダ（<code>apikey</code> ＝公開キー、<code>Content-Type</code> ＝ <code>application/json</code>）・本文を入れます。本文は <code>{"p_key":"合いかぎ","p_lat":緯度,"p_lng":経度}</code> のかたちで、緯度・経度には、アプリの「現在地の変数」を入れます（「本文（JSON）をコピー」で ひな形が取れます）。<br>' +
            '5. 位置情報の許可を「常に許可」にして、アプリの電池の最適化は「制限しない」にすると、止まりにくくなります。' +
        '</div></details>' +
        '<div class="meta">※ 画面の名前は、OS や アプリの版で少しちがうことがあります。うまくいかなくても、AREの本体には影響しません。</div>' +
        '<div class="row"><button type="button" class="button-secondary" data-t="pb:settings">← もどる</button><button type="button" class="button-secondary" data-pm="close">閉じる</button></div>');
}

async function pbkMake(){
    const has = !!(pbk.st && pbk.st.has_key);
    if(has && !confirm("合いかぎを作りなおします。いまの合いかぎは、すぐ使えなくなります（ショートカットの合いかぎも入れかえが必要です）。よろしいですか？")) return;
    try{
        const r = await pbRpc("passby_key_create_v1");
        if(!r || !r.ok){ showToast(r && r.error === "guest" ? "お試し（ゲスト）では使えません。登録してからお使いください。" : "作れませんでした。"); return; }
        pbkRemember(String(r.key || ""));
    }catch(e){ showToast(pbMissing(e) ? "まだ使えません（サーバーの準備中です）。" : "作れませんでした。通信を見て、もう一度お試しください。"); return; }
    await openPbKey();
}
async function pbkRevoke(){
    if(!confirm("合いかぎを無効にします。ショートカット（や自動化アプリ）からの送信は、止まります。よろしいですか？")) return;
    try{ await pbRpc("passby_key_revoke_v1"); pbkForget(); showToast("合いかぎを無効にしました。"); }
    catch(_e){ showToast("できませんでした。もう一度お試しください。"); return; }
    await openPbKey();
}
function pbkBody(){ return '{"p_key":"' + pbk.key + '","p_lat":緯度,"p_lng":経度}'; }
/** 文字をコピーする。ふつうの方法がだめなときは、見えない入力欄を使う方法でも やってみる（どちらも だめなら false） */
async function pbkWriteClipboard(t){
    try{ if(navigator.clipboard && navigator.clipboard.writeText){ await navigator.clipboard.writeText(t); return true; } }catch(_e){ /* 次の方法へ */ }
    const box = document.getElementById("pbKeyBox") || document.body;
    const ta = document.createElement("textarea");
    ta.value = t; ta.setAttribute("readonly", ""); ta.setAttribute("aria-hidden", "true");
    ta.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
    box.appendChild(ta);
    let ok = false;
    try{ ta.focus(); ta.select(); ta.setSelectionRange(0, t.length); ok = document.execCommand("copy"); }catch(_e){ ok = false; }
    ta.remove();
    return ok;
}
/** コピーしたことは、この画面の中で見せる（下のほうに出る吹き出しは、この画面の うしろにかくれて見えないため） */
function pbkCopyNote(node, ok){
    const msg = ok ? "コピーしました。" : "コピーできませんでした。上の欄の文字を、手でえらんで コピーしてください。";
    pbkSt(ok ? "✅ " + msg : "⚠️ " + msg);
    if(node && node.dataset){
        if(!node.dataset.pbkLabel) node.dataset.pbkLabel = node.textContent;
        node.textContent = ok ? "✅ コピーしました" : "⚠️ コピーできません";
        clearTimeout(Number(node.dataset.pbkTimer) || 0);
        node.dataset.pbkTimer = String(setTimeout(() => { if(node.isConnected) node.textContent = node.dataset.pbkLabel; }, 2200));
    }
    showToast(msg);
}
async function pbkCopy(k, node){
    if(!pbk.key || Date.now() >= pbk.exp){ showToast("もう見られません。作りなおしてください。"); pbkSt("もう見られません。作りなおしてください。"); return; }
    const t = k === "key" ? pbk.key : k === "url" ? pbkEndpoint() : k === "api" ? pbkPublicKey() : k === "body" ? pbkBody() : "";
    if(!t) return;
    const ok = await pbkWriteClipboard(t);
    if(!ok){ const i = document.getElementById(k === "key" ? "pbkKey" : k === "url" ? "pbkUrl" : "pbkApi"); if(i){ i.focus(); i.select(); } }
    pbkCopyNote(node, ok);
}
/** この端末の位置で、合いかぎが使えるかを、その場でためす（ショートカットと同じ入口を通ります） */
async function pbkTest(){
    if(!pbk.key || Date.now() >= pbk.exp){ showToast("試せるのは、合いかぎを作った直後だけです。"); return; }
    pbkSt("位置を調べています…");
    let pos;
    try{ pos = await pbGetPos(true); }
    catch(_e){ pbkSt("位置が取れませんでした。ブラウザの位置の許可を、見てください。"); return; }
    try{
        const c = pos.coords;
        const r = await pbRpc("passby_key_ping_v1", {p_key:pbk.key, p_lat:c.latitude, p_lng:c.longitude, p_acc:c.accuracy});
        if(r && r.ok){
            pbkSt(r.enabled === false ? "合いかぎは使えました。ただし「すれ違い」がオフなので、記録はしていません。" :
                r.throttled ? "合いかぎは使えました（すこし前に送っていたので、今回は記録しませんでした）。" :
                "✅ 合いかぎは使えました。" + (r.matched ? r.matched + "人と すれ違いました！" : "いまは、近くに すれ違う人は いません。"));
            if(r.matched && typeof pbCheckUnseen === "function") pbCheckUnseen();
        }else{
            const e = r && r.error;
            pbkSt(e === "bad_key" ? "合いかぎが合いません（作りなおされたか、無効です）。" : e === "too_rough" ? "位置のずれが大きいので、使えませんでした。" : e === "guest" ? "お試し（ゲスト）では使えません。" : "うまくいきませんでした。");
        }
    }catch(_e){ pbkSt("送れませんでした。通信を見て、もう一度お試しください。"); }
}

async function onPbKeyAction(action, node){
    if(action === "keyopen") await openPbKey();
    else if(action === "keymake") await pbkMake();
    else if(action === "keyrevoke") await pbkRevoke();
    else if(action === "keycopy") await pbkCopy(node && node.dataset ? node.dataset.k : "", node);
    else if(action === "keytest") await pbkTest();
}
