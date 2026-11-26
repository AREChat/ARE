/**
 * AIbot（カスタマイズAIbot 用の GAS）
 * ------------------------------------------------------------
 * ・チャットアプリ（ARE）の「カスタマイズAIbot」から文章を受け取り、Grok（xAI）に とどけて、答えを返します。
 * ・APIキーは、このファイルには 書きません。Apps Script の「プロジェクトの設定 → スクリプト プロパティ」にだけ 入れます。
 * ・受け取るのは「bot の画面で打った文章」と「キャラ設定」だけです。チャットの部屋・ほかの人の情報は 受け取りません。
 * ・会話の内容は、保存も ログ出力も しません（カウンタの数字だけ 保存します）。
 *
 * スクリプト プロパティ（＝この GAS の金庫）に入れるもの
 *   XAI_API_KEY : xAI の APIキー（必須）
 *   APP_TOKEN   : 合言葉（必須。6文字以上。長くて推測されにくいほど安全。アプリの せっていにも 同じものを入れる）
 *   XAI_MODEL   : 使うモデル名（任意。空なら grok-4.7）
 *   DAILY_LIMIT : 1日の上限回数（任意。空なら 60。無料枠を まもるための ブレーキ）
 *
 * デプロイ：「デプロイ → 新しいデプロイ → 種類：ウェブアプリ」
 *   次のユーザーとして実行：自分 ／ アクセスできるユーザー：全員  → 出てきた「…/exec」の URL を アプリに入れる
 *   ※ コードを直したら「デプロイを管理 → 編集 → 新バージョン」で 更新します（URL は かわりません）。
 */

var MAX_MESSAGES = 12;     // 一度に 送ってよい 会話の数（新しい順に 12 件まで）
var MAX_CONTENT = 1500;    // 1件の 文字数の 上限
var MAX_SYSTEM = 800;      // キャラ設定の 文字数の 上限
var MAX_OUT_TOKENS = 600;  // 答えの 長さの 上限（無料枠を まもる）
var MAX_AUTH_FAILS = 40;   // 合言葉の まちがいが 1日で これを こえたら その日は 受けつけない

function doPost(e) {
  try {
    // ★ ハブ追加分（hub-extra.gs）：通知・Office書き出し・テスト結果の受け口。action がついているものだけ、ここで渡す。
    //   hub-extra.gs を入れていなくても、AIbot の動きは 変わりません。
    if (typeof hubxParse_ === 'function') {
      var hb = hubxParse_(e);
      if (hb && hubxIsAction_(hb)) return hubxRoute_(hb);
    }
    var props = PropertiesService.getScriptProperties();
    var apiKey = props.getProperty('XAI_API_KEY');
    var appToken = props.getProperty('APP_TOKEN');
    if (!apiKey || !appToken || appToken.length < 6) return out_({ ok: false, code: 'setup' });

    var body = parse_(e);
    if (!body) return out_({ ok: false, code: 'input' });

    // 合言葉の たしかめ（まちがいが 多すぎる日は 受けつけない）
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    var day = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
    var failKey = 'fail_' + day, useKey = 'use_' + day;
    var fails = Number(props.getProperty(failKey) || 0);
    if (fails >= MAX_AUTH_FAILS) { lock.releaseLock(); return out_({ ok: false, code: 'limit' }); }
    if (!same_(String(body.token || ''), appToken)) {
      props.setProperty(failKey, String(fails + 1));
      lock.releaseLock();
      return out_({ ok: false, code: 'auth' });
    }

    // 1日の 上限
    var limit = Number(props.getProperty('DAILY_LIMIT') || 60);
    var used = Number(props.getProperty(useKey) || 0);
    if (used >= limit) { lock.releaseLock(); return out_({ ok: false, code: 'limit' }); }
    props.setProperty(useKey, String(used + 1));
    cleanOld_(props, day);
    lock.releaseLock();

    // 入力の 整え（長さ・形・役割だけ。ほかの項目は 受けつけない）
    var system = String(body.system || '').slice(0, MAX_SYSTEM);
    var msgs = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
    var input = [];
    if (system) input.push({ role: 'system', content: system });
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i] || {};
      var role = m.role === 'assistant' ? 'assistant' : (m.role === 'user' ? 'user' : '');
      var text = String(m.content || '').slice(0, MAX_CONTENT);
      if (role && text) input.push({ role: role, content: text });
    }
    if (!input.length || input[input.length - 1].role !== 'user') return out_({ ok: false, code: 'input' });

    var model = props.getProperty('XAI_MODEL') || 'grok-4.7';
    var res = UrlFetchApp.fetch('https://api.x.ai/v1/responses', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + apiKey },
      payload: JSON.stringify({ model: model, input: input, store: false, max_output_tokens: MAX_OUT_TOKENS }),
      muteHttpExceptions: true
    });
    var status = res.getResponseCode();
    var data = null;
    try { data = JSON.parse(res.getContentText()); } catch (_e) { data = null; }
    if (status < 200 || status >= 300 || !data) {
      var msg = data && data.error ? (data.error.message || data.error) : ('HTTP ' + status);
      return out_({ ok: false, code: 'upstream', error: String(msg).slice(0, 120) });
    }
    var reply = pickText_(data);
    if (!reply) return out_({ ok: false, code: 'upstream', error: 'からの こたえ' });
    return out_({ ok: true, reply: reply });
  } catch (err) {
    try { LockService.getScriptLock().releaseLock(); } catch (_e) {}
    return out_({ ok: false, code: 'error', error: String(err && err.message || err).slice(0, 80) });
  }
}

// ブラウザで URL を 開いたときの かんたんな 返事（動作確認用。中身は 何も 見せません）
function doGet(e) {
  if (typeof hubxGet_ === 'function') { var h = hubxGet_(e && e.parameter); if (h) return h; }   // ハブ追加分（?action=ci など）
  return out_({ ok: true, name: 'AIbot' });
}

function parse_(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  if (e.postData.contents.length > 40000) return null;
  try { var o = JSON.parse(e.postData.contents); return o && typeof o === 'object' ? o : null; } catch (_e) { return null; }
}

// 文字列の くらべ（長さが ちがっても 時間が かわらないように）
function same_(a, b) {
  var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

// xAI（Responses API）の 答えから 文章を 取り出す
function pickText_(d) {
  if (typeof d.output_text === 'string' && d.output_text) return d.output_text.trim();
  var outs = Array.isArray(d.output) ? d.output : [];
  var text = '';
  for (var i = 0; i < outs.length; i++) {
    var c = outs[i] && outs[i].content;
    if (!Array.isArray(c)) continue;
    for (var j = 0; j < c.length; j++) if (c[j] && typeof c[j].text === 'string') text += c[j].text;
  }
  return text.trim();
}

// 古い日の カウンタを 消す
function cleanOld_(props, today) {
  var all = props.getKeys();
  for (var i = 0; i < all.length; i++) {
    var k = all[i];
    if ((k.indexOf('use_') === 0 || k.indexOf('fail_') === 0) && k.split('_')[1] !== today) props.deleteProperty(k);
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
