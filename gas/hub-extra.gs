/**
 * ARE ハブ（追加分）― Android アプリの「強い通知」／ Excel・Word・PowerPoint の書き出し／ テスト結果の受け口
 *
 * ★ これは「AIbot」の GAS に、あとから つけたすファイルです。AIbot-Code.gs の動きは、そのまま変わりません。
 *   （合言葉 APP_TOKEN と xAI の鍵は、これまでどおり AIbot だけが使います。ここでは使いません）
 *
 *   ① push   ：Android アプリの端末番号を GAS の金庫（スクリプト プロパティ）に覚えて、Firebase（無料）で通知を送る
 *   ② office ：予定表や記録の表を、Googleのスプレッドシート・ドキュメント・スライドで きれいに作り、
 *              Excel(.xlsx)・Word(.docx)・PowerPoint(.pptx) にして ドライブに置き、リンクを返す
 *   ③ ci     ：パソコンの Python（tools/run_all_tests.py など）が、テスト結果やアプリのファイルを ここへ送る。
 *              GitHub Actions や Cloudflare の自動実行のかわりです。ドライブに保管し、毎朝 サイトの見張りもします
 *
 * 使い方
 *   1) スクリプトエディタの「＋」→「スクリプト」→ 名前を hub-extra にして、このコード全部を貼る → 保存
 *   2) AIbot-Code.gs を gas/AIbot-Code.gs の新しい版に貼りかえる（doPost / doGet に数行ふえています）
 *   3) 「デプロイ」→「デプロイを管理」→ えんぴつ → バージョン「新バージョン」→「デプロイ」
 *      （権限の確認が出たら「許可」。ドライブ・スプレッドシート・ドキュメント・スライドを使う許可です）
 *   4) スクリプト プロパティに、使うものだけ入れる（native/README.md に画面つきの手順があります）
 *        ［通知］FB_PROJECT_ID / FB_APP_ID / FB_API_KEY / FB_SENDER_ID … Firebase の「プロジェクトの設定」の値（公開してよい値）
 *                FCM_SERVICE_ACCOUNT … Firebase「サービス アカウント」→「新しい秘密鍵を生成」の JSON ぜんぶ（秘密）
 *                PUSH_SECRET … 自分で決めた長い合言葉（Supabase の関数が通知をたのむときに使う。秘密）
 *        ［テスト結果］CI_SECRET … 自分で決めた長い合言葉（パソコンの Python が結果を送るときに使う。秘密）
 *        ［見張り］WATCH_URLS … 毎朝 見張る URL を、カンマでつなげたもの（空なら ARE の画面だけ）
 *   5) 毎朝の見張り：「トリガー」→「トリガーを追加」→ 実行する関数 hubxDailyWatch ／ 時間主導型 ／ 日付ベース ／ 午前3時〜4時
 */
var HUBX = {
  // ログインの確認に使う Supabase（公開してよい値だけ）
  SUPABASE_URL: 'https://kzrrnuzzvwijujhlbtln.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_lO7m63Or44b-CIRWfYMcjA_z_WuONpi',
  TZ: 'Asia/Tokyo',
  FOLDER_NAME: 'ARE-ハブ',        // ドライブの、いちばん上に作るフォルダ（なければ自動で作る）
  CI_KEEP: 60,               // テスト結果を残す件数（古いものから消す）
  CI_MAX_FILE_BYTES: 40 * 1024 * 1024,   // アプリなどのファイルを受け取る上限（GAS の決まりで 約50MB まで）
  SITE_URL: 'https://arechat.github.io/ARE/',
  MAX_DEVICES_PER_USER: 5,   // 1人が登録できる端末の数（古いものから入れかわる）
  MAX_ITEMS: 200,            // 1回の「送って」で扱う宛先の数
  OFFICE_MAX_ROWS: 2000,
  OFFICE_MAX_COLS: 30,
  OFFICE_DAILY_MAX: 30,      // 1人が1日にできる書き出しの回数
  MIME: {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  }
};

// ============================================================
//  ① 通知（Android アプリ）
// ============================================================
function pushApi_(body) {
  var op = String(body.op || '');
  if (op === 'send') return pushSend_(body);   // Supabase の関数から（合言葉つき）
  var uid = hubxVerify_(body.token);
  if (op === 'config') return pushConfig_();
  if (op === 'register') return pushRegister_(uid, body);
  if (op === 'unregister') return pushUnregister_(uid, body);
  return { ok: false, message: '不明な操作です。' };
}

// アプリに渡す Firebase の接続値（公開してよい値だけ）。入っていなければ「まだ使えない」と返す
function pushConfig_() {
  var p = PropertiesService.getScriptProperties();
  var f = { projectId: p.getProperty('FB_PROJECT_ID'), appId: p.getProperty('FB_APP_ID'), apiKey: p.getProperty('FB_API_KEY'), senderId: p.getProperty('FB_SENDER_ID') };
  var enabled = !!(f.projectId && f.appId && f.apiKey && f.senderId && p.getProperty('FCM_SERVICE_ACCOUNT') && p.getProperty('PUSH_SECRET'));
  return enabled ? { ok: true, enabled: true, firebase: f } : { ok: true, enabled: false };
}

function pushRegister_(uid, body) {
  var device = String(body.device || ''), fcm = String(body.fcm || '');
  if (!/^[0-9a-f]{32}$/.test(device)) return { ok: false, message: '端末の番号が正しくありません。' };
  if (!/^[A-Za-z0-9:_\-]{60,512}$/.test(fcm)) return { ok: false, message: '通知の番号が正しくありません。' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var p = PropertiesService.getScriptProperties();
    var all = p.getProperties(), mine = [];
    Object.keys(all).forEach(function (k) {
      if (k.indexOf('pd:') !== 0) return;
      var v; try { v = JSON.parse(all[k]); } catch (e) { p.deleteProperty(k); return; }
      if (k !== 'pd:' + device && v.t === fcm) { p.deleteProperty(k); return; }   // 同じ通知番号が、別の端末番号で残っていたら消す
      if (v.u === uid && k !== 'pd:' + device) mine.push({ k: k, ts: v.ts || 0 });
    });
    mine.sort(function (a, b) { return a.ts - b.ts; });
    while (mine.length >= HUBX.MAX_DEVICES_PER_USER) p.deleteProperty(mine.shift().k);   // 多すぎるときは、古いものから外す
    p.setProperty('pd:' + device, JSON.stringify({ u: uid, t: fcm, ts: Date.now() }));
  } finally { lock.releaseLock(); }
  return { ok: true };
}

function pushUnregister_(uid, body) {
  var device = String(body.device || '');
  if (!/^[0-9a-f]{32}$/.test(device)) return { ok: false, message: '端末の番号が正しくありません。' };
  var p = PropertiesService.getScriptProperties();
  var raw = p.getProperty('pd:' + device);
  if (raw) { try { if (JSON.parse(raw).u === uid) p.deleteProperty('pd:' + device); } catch (e) { p.deleteProperty('pd:' + device); } }
  return { ok: true };
}

function hubxSame_(a, b) {   // 合言葉の比べ方：長さがちがっても、いつも同じ手間で比べる
  var ha = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'a|' + a), hb = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'a|' + b);
  var d = 0;
  for (var i = 0; i < ha.length; i++) d |= (ha[i] ^ hb[i]);
  return d === 0;
}

// Supabase の関数（send-push など）から：宛先の端末へ、通知を送る
function pushSend_(body) {
  var p = PropertiesService.getScriptProperties();
  var want = p.getProperty('PUSH_SECRET');
  if (!want || !hubxSame_(String(body.secret || ''), want)) return { ok: false, message: 'forbidden' };
  var cfg = pushConfig_();
  if (!cfg.enabled) return { ok: false, message: 'not_configured' };
  var items = Array.isArray(body.items) ? body.items.slice(0, HUBX.MAX_ITEMS) : [];
  var reqs = [], keys = [];
  items.forEach(function (it) {
    var device = String((it && it.device) || '');
    if (!/^[0-9a-f]{32}$/.test(device)) return;
    var raw = p.getProperty('pd:' + device);
    if (!raw) return;
    var rec; try { rec = JSON.parse(raw); } catch (e) { return; }
    if (it.user && rec.u !== String(it.user)) return;   // 端末をべつの人が使っているときは、前の人の通知は送らない
    if (it.u8 && String(rec.u).slice(0, 8) !== String(it.u8)) return;   // （Supabase の宛先の名前 fcm:端末:先頭8桁 にある、持ち主の目印）
    var t = rec.t;
    var type = /^(msg|call|morning|clear|emergency)$/.test(String(it.type)) ? String(it.type) : 'msg';
    var data = { type: type, title: String(it.title || '').slice(0, 80), body: String(it.body || '').slice(0, 140), room: String(it.room || '').slice(0, 40), tag: String(it.tag || '').slice(0, 60), silent: it.silent ? '1' : '0' };
    reqs.push({
      url: 'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(cfg.firebase.projectId) + '/messages:send',
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + fcmAccessToken_() },
      payload: JSON.stringify({ message: { token: t, data: data, android: { priority: 'HIGH', ttl: (type === 'call' ? '45s' : type === 'clear' ? '60s' : '3600s') } } })
    });
    keys.push('pd:' + device);
  });
  if (!reqs.length) return { ok: true, sent: 0, removed: 0, failed: 0 };
  var res = UrlFetchApp.fetchAll(reqs), sent = 0, removed = 0, failed = 0;
  res.forEach(function (r, i) {
    var code = r.getResponseCode();
    if (code === 200) { sent++; return; }
    var text = String(r.getContentText() || '');
    if (code === 404 || /UNREGISTERED|registration token is not a valid/i.test(text)) { p.deleteProperty(keys[i]); removed++; }   // もう使われていない端末
    else { failed++; console.error('fcm failed ' + code + ' ' + text.slice(0, 120)); }
  });
  return { ok: true, sent: sent, removed: removed, failed: failed };
}

// Firebase に送るための「入場券」（サービス アカウントで作る。50分ぶん覚えておく）
function fcmAccessToken_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('fcm:at');
  if (hit) return hit;
  var sa = JSON.parse(PropertiesService.getScriptProperties().getProperty('FCM_SERVICE_ACCOUNT'));
  var now = Math.floor(Date.now() / 1000);
  var b64 = function (s) { return Utilities.base64EncodeWebSafe(s).replace(/=+$/, ''); };
  var head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var claim = b64(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(head + '.' + claim, sa.private_key)).replace(/=+$/, '');
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + sig }
  });
  if (res.getResponseCode() !== 200) throw new Error('Firebase の入場券を作れませんでした（サービス アカウントの JSON を確認してください）。');
  var tok = JSON.parse(res.getContentText()).access_token;
  cache.put('fcm:at', tok, 3000);
  return tok;
}

// ============================================================
//  ② Office 書き出し（Excel / Word / PowerPoint）
// ============================================================
//  body: { action:'office', token, format:'xlsx'|'docx'|'pptx', title, columns:[…], rows:[[…],…], summary:[…], slideCols:[0,3,…] }
function officeApi_(body) {
  var uid = hubxVerify_(body.token);
  var fmt = String(body.format || '');
  if (!HUBX.MIME[fmt]) return { ok: false, message: '書き出せる形式は、Excel・Word・PowerPoint です。' };
  var spec = officeClean_(body);
  if (spec.error) return { ok: false, message: spec.error };
  var left = officeUse_(uid);
  if (left < 0) return { ok: false, message: 'きょうの書き出しは、' + HUBX.OFFICE_DAILY_MAX + '回までです。あした、またお試しください。' };
  var gid = fmt === 'xlsx' ? officeSheet_(spec) : fmt === 'docx' ? officeDoc_(spec) : officeSlides_(spec);
  try {
    var stamp = Utilities.formatDate(new Date(), HUBX.TZ, 'yyyyMMdd-HHmm');
    var name = hubxName_(spec.title) + '_' + stamp;
    var res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + gid + '/export?mimeType=' + encodeURIComponent(HUBX.MIME[fmt]), {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) throw new Error('ファイルを作れませんでした（' + res.getResponseCode() + '）。');
    var file = hubxMonthFolder_().createFile(res.getBlob().setName(name + '.' + fmt));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { ok: true, id: file.getId(), name: name + '.' + fmt, url: 'https://drive.google.com/file/d/' + file.getId() + '/view', download: 'https://drive.google.com/uc?export=download&id=' + file.getId(), left: left };
  } finally {
    try { DriveApp.getFileById(gid).setTrashed(true); } catch (e) { /* 一時ファイルが消せなくても、続ける */ }
  }
}

// 入力の点検と、そうじ（表の大きさ・文字の長さ・数式あつかい）
function officeClean_(b) {
  var cols = Array.isArray(b.columns) ? b.columns : [], rows = Array.isArray(b.rows) ? b.rows : [];
  if (!cols.length || cols.length > HUBX.OFFICE_MAX_COLS) return { error: '列の数は 1〜' + HUBX.OFFICE_MAX_COLS + ' にしてください。' };
  if (rows.length > HUBX.OFFICE_MAX_ROWS) return { error: '行の数は ' + HUBX.OFFICE_MAX_ROWS + ' までです。' };
  var cell = function (v) { return v == null ? '' : String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, 2000); };
  var out = { title: cell(b.title || '一覧').slice(0, 80) || '一覧', columns: cols.map(function (c) { return cell(c).slice(0, 60); }), rows: [], summary: [], slideCols: [] };
  rows.forEach(function (r) {
    var a = Array.isArray(r) ? r : [];
    var line = [];
    for (var i = 0; i < cols.length; i++) line.push(cell(a[i]));
    out.rows.push(line);
  });
  (Array.isArray(b.summary) ? b.summary : []).slice(0, 20).forEach(function (s) { out.summary.push(cell(s).slice(0, 300)); });
  var sc = Array.isArray(b.slideCols) ? b.slideCols : [];
  sc.forEach(function (i) { i = parseInt(i, 10); if (i >= 0 && i < cols.length && out.slideCols.indexOf(i) < 0 && out.slideCols.length < 7) out.slideCols.push(i); });
  if (!out.slideCols.length) for (var j = 0; j < Math.min(cols.length, 6); j++) out.slideCols.push(j);
  return out;
}

// 1日の回数を数える（使いきったら -1）
function officeUse_(uid) {
  var p = PropertiesService.getScriptProperties(), day = Utilities.formatDate(new Date(), HUBX.TZ, 'yyyy-MM-dd'), k = 'ofd:' + uid;
  var cur = String(p.getProperty(k) || ''), n = 0;
  if (cur.indexOf(day + ':') === 0) n = parseInt(cur.slice(day.length + 1), 10) || 0;
  if (n >= HUBX.OFFICE_DAILY_MAX) return -1;
  p.setProperty(k, day + ':' + (n + 1));
  return HUBX.OFFICE_DAILY_MAX - n - 1;
}

function officeSheet_(s) {
  var ss = SpreadsheetApp.create(s.title), sh = ss.getActiveSheet(), n = s.columns.length;
  sh.setName('一覧');
  var values = [s.columns].concat(s.rows);
  var all = sh.getRange(1, 1, values.length, n);
  all.setNumberFormat('@');   // すべて「文字」として入れる（=で始まる文字が、数式として動かないように）
  all.setValues(values);
  sh.getRange(1, 1, 1, n).setFontWeight('bold').setBackground('#dbe7ff');
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, n);
  if (s.summary.length) {
    var m = ss.insertSheet('まとめ');
    var r = m.getRange(1, 1, s.summary.length, 1);
    r.setNumberFormat('@');
    r.setValues(s.summary.map(function (x) { return [x]; }));
    m.setColumnWidth(1, 520);
  }
  SpreadsheetApp.flush();
  return ss.getId();
}

function officeDoc_(s) {
  var doc = DocumentApp.create(s.title), body = doc.getBody(), n = s.columns.length;
  if (n > 5) { body.setPageWidth(842).setPageHeight(595); }   // 列が多いときは、A4 の横むき
  body.setMarginLeft(28).setMarginRight(28).setMarginTop(28).setMarginBottom(28);
  body.appendParagraph(s.title).setHeading(DocumentApp.ParagraphHeading.TITLE);
  s.summary.forEach(function (t) { body.appendParagraph(t); });
  var data = [s.columns].concat(s.rows.length ? s.rows : [s.columns.map(function () { return ''; })]);
  var tbl = body.appendTable(data);
  tbl.setFontSize(n > 8 ? 7 : 9);
  var head = tbl.getRow(0);
  for (var c = 0; c < n; c++) head.getCell(c).setBackgroundColor('#dbe7ff').editAsText().setBold(true);
  doc.saveAndClose();
  return doc.getId();
}

function officeSlides_(s) {
  var pres = SlidesApp.create(s.title), first = pres.getSlides()[0];
  var W = pres.getPageWidth(), H = pres.getPageHeight();
  var add = function () { return pres.appendSlide(SlidesApp.PredefinedLayout.BLANK); };
  var text = function (slide, str, x, y, w, h, size, bold) {
    var box = slide.insertTextBox(str, x, y, w, h);
    box.getText().getTextStyle().setFontSize(size).setBold(!!bold);
    return box;
  };
  var t = add();
  text(t, s.title, 40, H / 2 - 50, W - 80, 70, 36, true);
  text(t, 'ARE', 40, H / 2 + 20, W - 80, 40, 18, false);
  if (s.summary.length) {
    var sm = add();
    text(sm, 'まとめ', 40, 24, W - 80, 44, 28, true);
    text(sm, s.summary.join('\n'), 40, 84, W - 80, H - 120, 16, false);
  }
  var idx = s.slideCols, per = 8, pages = Math.max(1, Math.ceil(s.rows.length / per));
  for (var pg = 0; pg < pages; pg++) {
    var sl = add();
    text(sl, s.title + (pages > 1 ? '（' + (pg + 1) + '/' + pages + '）' : ''), 40, 14, W - 80, 36, 20, true);
    var part = s.rows.slice(pg * per, pg * per + per);
    var tbl = sl.insertTable(part.length + 1, idx.length, 30, 60, W - 60, Math.min(H - 90, 34 * (part.length + 1)));
    for (var c = 0; c < idx.length; c++) {
      var hc = tbl.getCell(0, c);
      hc.getText().setText(s.columns[idx[c]]);
      hc.getText().getTextStyle().setFontSize(12).setBold(true);
      hc.getFill().setSolidFill('#dbe7ff');
    }
    for (var r = 0; r < part.length; r++) {
      for (var c2 = 0; c2 < idx.length; c2++) {
        var cell = tbl.getCell(r + 1, c2);
        cell.getText().setText(part[r][idx[c2]]);
        cell.getText().getTextStyle().setFontSize(11);
      }
    }
  }
  first.remove();   // さいしょから入っている空のスライドを消す
  pres.saveAndClose();
  return pres.getId();
}

// ============================================================
//  入り口（AIbot-Code.gs の doPost / doGet から呼ばれる）
// ============================================================
// ふつうの AIbot の受けつけ（4万文字まで）より大きい本文（アプリのファイルなど）も、ここで読む（約55MBまで）
function hubxParse_(e) {
  var c = e && e.postData && e.postData.contents;
  if (!c || c.length > 56 * 1024 * 1024) return null;
  if (c.charAt(0) !== '{' || c.indexOf('"action"') < 0 || c.indexOf('"action"') > 200) return null;   // action が先頭にないものは AIbot のもの
  try { var o = JSON.parse(c); return o && typeof o === 'object' ? o : null; } catch (err) { return null; }
}
function hubxIsAction_(body) { return !!body && typeof body === 'object' && /^(push|office|ci|sync)$/.test(String(body.action || '')); }

function hubxRoute_(body) {
  try {
    var a = String(body.action);
    if (a === 'push') return hubxOut_(pushApi_(body));
    if (a === 'office') return hubxOut_(officeApi_(body));
    if (a === 'ci') return hubxOut_(ciApi_(body));
    if (a === 'sync') return hubxOut_(syncApi_(body));
  } catch (err) {
    return hubxOut_({ ok: false, message: String(err && err.message ? err.message : err).slice(0, 200) });
  }
  return hubxOut_({ ok: false, message: '不明な操作です。' });
}

// ブラウザで開いたときの返事。?action=ci … 最近のテスト結果の一覧（秘密は入っていません）
function hubxGet_(params) {
  var a = String((params && params.action) || '');
  if (a === 'ci') return hubxOut_(ciStatus_());
  if (a === 'hub') return hubxOut_({ ok: true, name: 'hub-extra', version: '2026-11-26', features: ['push', 'office', 'ci', 'sync'] });
  return null;
}

// ============================================================
//  ④ 引き継ぎ（sync）：ゲーム・学習アプリの保存データを、同じアカウントのどの端末でも使えるようにする
// ============================================================
//  Supabase（SQL）は容量が少ないので、Googleドライブ（GAS）に置く。1人・1アプリごとに1つのファイル：
//    ARE-ハブ/引き継ぎ/<ユーザー番号>/<アプリ名>.json   中身：{ キー名: {t:更新時刻, v:文字列} または {t, del:1} }
//  body: { action:'sync', op:'pull'|'push', token, app, have:{キー名:t,…}, items:{キー名:{t,v}|{t,del:1},…} }
//   pull … 手元より新しい項目だけを返す（have に無いキーは、すべて返す）
//   push … 項目ごとに「新しいほうが勝つ」で取り込む。サーバーのほうが新しかった項目は、そのまま返す（手元を直してもらう）
//  ログインの確認は、他と同じ Supabase の合いかぎ。自分の分しか読めない・書けない（ユーザー番号は合いかぎから決まる）
var SYNC = { MAX_VALUE: 900 * 1024, MAX_KEYS: 400, MAX_FILE: 6 * 1024 * 1024, MAX_PUSH_KEYS: 120, PER_MIN: 40 };
function syncApi_(body) {
  var uid = hubxVerify_(body.token);
  var app = String(body.app || '');
  if (!/^[a-z0-9][a-z0-9_-]{0,23}$/.test(app)) return { ok: false, message: 'アプリの名前が正しくありません。' };
  var op = String(body.op || '');
  if (op !== 'pull' && op !== 'push') return { ok: false, message: '操作が正しくありません。' };
  if (!syncRate_(uid)) return { ok: false, message: 'すこし多すぎます。1分ほど待ってから、もう一度おためしください。', busy: true };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var file = syncFile_(uid, app, op === 'push');
    var map = syncRead_(file);
    if (op === 'pull') {
      var have = body.have && typeof body.have === 'object' ? body.have : {}, out = {}, n = 0;
      var only = Array.isArray(body.keys) ? body.keys.slice(0, SYNC.MAX_PUSH_KEYS) : null;      // keys があれば、その項目だけ（手元の時刻に関係なく）返す
      if (only) only.forEach(function (k) { k = String(k); if (map[k]) { out[k] = map[k]; n++; } });
      else Object.keys(map).forEach(function (k) { var h = Number(have[k]); if (!(h >= map[k].t)) { out[k] = map[k]; n++; } });
      return { ok: true, items: out, count: n, total: Object.keys(map).length, now: Date.now() };
    }
    var items = body.items && typeof body.items === 'object' ? body.items : {}, keys = Object.keys(items);
    if (keys.length > SYNC.MAX_PUSH_KEYS) return { ok: false, message: '1回に送れる項目は ' + SYNC.MAX_PUSH_KEYS + ' までです。' };
    var accepted = [], newer = {}, changed = false;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], it = items[k];
      if (!/^[A-Za-z0-9_:.\-]{1,80}$/.test(k) || !it || typeof it !== 'object') continue;
      var t = Number(it.t);
      if (!(t > 0) || t > Date.now() + 24 * 3600 * 1000) continue;      // 時刻がおかしい（大きく未来）ものは取り込まない
      var cur = map[k];
      if (cur && cur.t >= t) { if (cur.t > t || cur.v !== it.v || !!cur.del !== !!it.del) newer[k] = cur; continue; }
      if (it.del) { map[k] = { t: t, del: 1 }; }
      else {
        if (typeof it.v !== 'string' || it.v.length > SYNC.MAX_VALUE) continue;
        map[k] = { t: t, v: it.v };
      }
      accepted.push(k); changed = true;
    }
    if (Object.keys(map).length > SYNC.MAX_KEYS) return { ok: false, message: '保存できる項目の数をこえました。' };
    if (changed) {
      var text = JSON.stringify(map);
      if (text.length > SYNC.MAX_FILE) return { ok: false, message: '保存できる大きさをこえました。' };
      syncWrite_(file, text);
    }
    return { ok: true, accepted: accepted, newer: newer, now: Date.now() };
  } finally {
    lock.releaseLock();
  }
}
function syncRate_(uid) {
  var c = CacheService.getScriptCache(), k = 'syr:' + uid.slice(0, 12) + ':' + Math.floor(Date.now() / 60000), n = parseInt(c.get(k) || '0', 10) || 0;
  if (n >= SYNC.PER_MIN) return false;
  c.put(k, String(n + 1), 120);
  return true;
}
function syncFile_(uid, app, create) {
  var base = hubxFolder_('引き継ぎ'), it = base.getFoldersByName(uid), dir = it.hasNext() ? it.next() : (create ? base.createFolder(uid) : null);
  if (!dir) return { dir: null, file: null, name: app + '.json' };
  var fi = dir.getFilesByName(app + '.json');
  return { dir: dir, file: fi.hasNext() ? fi.next() : null, name: app + '.json' };
}
function syncRead_(f) {
  if (!f.file) return {};
  try { var o = JSON.parse(f.file.getBlob().getDataAsString('UTF-8')); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}
function syncWrite_(f, text) {
  if (f.file) f.file.setContent(text);
  else f.file = f.dir.createFile(f.name, text, 'application/json');
}

// ============================================================
//  道具
// ============================================================
function hubxOut_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

function hubxName_(s) { return String(s || 'file').replace(/[\\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file'; }

// ログイン確認：Supabase に「この合いかぎは本物？」と聞く（200 なら本物）
function hubxVerify_(token) {
  if (!token) throw new Error('ログインが確認できません。');
  var res = UrlFetchApp.fetch(HUBX.SUPABASE_URL + '/auth/v1/user', {
    headers: { Authorization: 'Bearer ' + token, apikey: HUBX.SUPABASE_PUBLISHABLE_KEY }, muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('ログインが確認できません。もう一度ログインしてください。');
  var u = JSON.parse(res.getContentText());
  if (!u || !u.id) throw new Error('ログインが確認できません。');
  return String(u.id);
}

// ドライブの「ARE-ハブ」フォルダの中の、決まった名前のフォルダ（なければ作る）
function hubxFolder_(sub) {
  var it = DriveApp.getFoldersByName(HUBX.FOLDER_NAME), root = it.hasNext() ? it.next() : DriveApp.createFolder(HUBX.FOLDER_NAME);
  if (!sub) return root;
  var s = root.getFoldersByName(sub);
  return s.hasNext() ? s.next() : root.createFolder(sub);
}
function hubxMonthFolder_() {
  var m = Utilities.formatDate(new Date(), HUBX.TZ, 'yyyy-MM'), base = hubxFolder_('書き出し');
  var it = base.getFoldersByName(m);
  return it.hasNext() ? it.next() : base.createFolder(m);
}

// ============================================================
//  ③ テスト結果の受け口（GitHub Actions のかわり）
// ============================================================
//  body: { action:'ci', op:'report', secret, name, status:'pass'|'fail', summary:{total,pass,fail,warn}, text, host }
//        { action:'ci', op:'artifact', secret, name, mime, b64 }
function ciApi_(body) {
  var want = PropertiesService.getScriptProperties().getProperty('CI_SECRET');
  if (!want || want.length < 16) return { ok: false, message: 'CI_SECRET がまだ設定されていません（16文字以上）。' };
  if (!hubxSame_(String(body.secret || ''), want)) return { ok: false, message: 'forbidden' };
  var op = String(body.op || '');
  if (op === 'report') return ciReport_(body);
  if (op === 'artifact') return ciArtifact_(body);
  if (op === 'ping') return { ok: true, time: new Date().toISOString() };
  return { ok: false, message: '不明な操作です。' };
}

function ciReport_(b) {
  var name = hubxName_(b.name || 'tests').slice(0, 40), status = b.status === 'pass' ? 'pass' : 'fail';
  var sm = b.summary && typeof b.summary === 'object' ? b.summary : {};
  var summary = { total: +sm.total || 0, pass: +sm.pass || 0, fail: +sm.fail || 0, warn: +sm.warn || 0 };
  return ciSave_(name, status, summary, String(b.text || '').slice(0, 300000), String(b.host || '').slice(0, 40));
}

function ciSave_(name, status, summary, text, host) {
  var stamp = Utilities.formatDate(new Date(), HUBX.TZ, 'yyyyMMdd-HHmmss');
  var file = hubxFolder_('テスト結果').createFile(stamp + '_' + name + '_' + status + '.md', text || '(本文なし)', MimeType.PLAIN_TEXT);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var p = PropertiesService.getScriptProperties(), idx = [];
    try { idx = JSON.parse(p.getProperty('ci:idx') || '[]'); } catch (e) { idx = []; }
    idx.unshift({ t: Date.now(), n: name, s: status, m: summary, h: host, f: file.getId() });
    while (idx.length > HUBX.CI_KEEP) { var old = idx.pop(); try { DriveApp.getFileById(old.f).setTrashed(true); } catch (e) { /* もうないときは、そのまま */ } }
    while (JSON.stringify(idx).length > 8500) { var o2 = idx.pop(); try { DriveApp.getFileById(o2.f).setTrashed(true); } catch (e) { /* 同上 */ } }
    p.setProperty('ci:idx', JSON.stringify(idx));
  } finally { lock.releaseLock(); }
  return { ok: true, id: file.getId(), url: file.getUrl(), kept: HUBX.CI_KEEP };
}

// アプリ（.apk など）を受け取って、ドライブの「ビルド」フォルダに置く（20個まで。古いものから消す）
function ciArtifact_(b) {
  var name = hubxName_(b.name || 'file.bin');
  var raw = String(b.b64 || '');
  if (!raw || raw.length > HUBX.CI_MAX_FILE_BYTES * 1.4) return { ok: false, message: 'ファイルが大きすぎます（約' + Math.round(HUBX.CI_MAX_FILE_BYTES / 1048576) + 'MBまで）。' };
  var bytes = Utilities.base64Decode(raw);
  if (bytes.length > HUBX.CI_MAX_FILE_BYTES) return { ok: false, message: 'ファイルが大きすぎます。' };
  var blob = Utilities.newBlob(bytes, String(b.mime || 'application/octet-stream').slice(0, 80), name);
  var dir = hubxFolder_('ビルド'), file = dir.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var all = [], it = dir.getFiles();
  while (it.hasNext()) all.push(it.next());
  all.sort(function (x, y) { return y.getDateCreated().getTime() - x.getDateCreated().getTime(); });
  for (var i = 20; i < all.length; i++) { try { all[i].setTrashed(true); } catch (e) { /* 続ける */ } }
  return { ok: true, id: file.getId(), url: 'https://drive.google.com/file/d/' + file.getId() + '/view', download: 'https://drive.google.com/uc?export=download&id=' + file.getId(), bytes: bytes.length };
}

function ciStatus_() {
  var idx = [];
  try { idx = JSON.parse(PropertiesService.getScriptProperties().getProperty('ci:idx') || '[]'); } catch (e) { idx = []; }
  return { ok: true, count: idx.length, latest: idx[0] ? { t: idx[0].t, name: idx[0].n, status: idx[0].s, summary: idx[0].m } : null, list: idx.slice(0, 20).map(function (x) { return { t: x.t, name: x.n, status: x.s, summary: x.m, host: x.h }; }) };
}

// ============================================================
//  毎朝の見張り（GitHub の「毎日1回の自動実行」のかわり）
//  トリガー：実行する関数 hubxDailyWatch ／ 時間主導型 ／ 日付ベース ／ 午前3時〜4時
// ============================================================
function hubxDailyWatch() {
  var p = PropertiesService.getScriptProperties();
  var urls = [HUBX.SITE_URL + 'chat.html', HUBX.SITE_URL + 'version.json', HUBX.SITE_URL + 'sw.js'];
  String(p.getProperty('WATCH_URLS') || '').split(',').forEach(function (u) { u = u.trim(); if (/^https:\/\//.test(u) && urls.length < 20) urls.push(u); });
  var rows = [], bad = 0;
  urls.forEach(function (u) {
    var t0 = Date.now(), code = 0;
    try { code = UrlFetchApp.fetch(u, { muteHttpExceptions: true, followRedirects: true }).getResponseCode(); } catch (e) { code = -1; }
    if (code !== 200) bad++;
    rows.push('- ' + (code === 200 ? '○' : '×') + ' ' + code + ' (' + (Date.now() - t0) + 'ms) ' + u);
  });
  // Supabase を眠らせない（時刻を返すだけの関数。テーブルには さわりません）
  var kc = 0;
  try { kc = UrlFetchApp.fetch(HUBX.SUPABASE_URL + '/rest/v1/rpc/keepalive_v1', { method: 'post', contentType: 'application/json', payload: '{}', headers: { apikey: HUBX.SUPABASE_PUBLISHABLE_KEY }, muteHttpExceptions: true }).getResponseCode(); } catch (e) { kc = -1; }
  if (kc !== 200) bad++;
  rows.push('- ' + (kc === 200 ? '○' : '×') + ' ' + kc + ' Supabase（眠らせない呼びかけ）');
  var status = bad ? 'fail' : 'pass';
  var text = '# 毎朝の見張り ' + Utilities.formatDate(new Date(), HUBX.TZ, 'yyyy-MM-dd HH:mm') + '\n\n' + rows.join('\n') + '\n';
  ciSave_('daily_watch', status, { total: urls.length + 1, pass: urls.length + 1 - bad, fail: bad, warn: 0 }, text, 'gas');
  if (bad) {   // こわれていたら、持ち主にメールで知らせる（無料）
    try { MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '【ARE】毎朝の見張りで ' + bad + ' 件、うまくいきませんでした', text); } catch (e) { console.error('mail: ' + e); }
  }
  return status;
}
