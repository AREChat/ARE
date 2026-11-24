/**
 * ファイル保存（Google Apps Script）― ARE のファイル・写真・動画・音声は、ぜんぶ ここ（Googleドライブ）に置きます
 *
 * ・Supabase の通信量（Cached Egress）を使わないため、1バイト以上のものは ぜんぶ ドライブへ。
 * ・置き場所は「ファイル保存フォルダ」1つだけ（月ごとのフォルダ 2026-11 などに分けて入れます）。動画も同じ場所です。
 * ・自動では消しません（2TB あるため）。ドライブのフォルダの中は、あなたが自分で整理してください。
 *
 * 流れ（チャット → このGAS → ドライブ）
 *   1) start  ：ログイン確認・回数と量のチェック → ドライブの「アップロード口」を返す
 *   2) チャットが、その口へ ファイルを直接アップロード（進み具合は チャット側で表示）
 *   3) finish ：「リンクを知っている全員が見られる」に設定 → 見るためのリンクと番号（id）を返す
 *   ほかに（これまでと同じ）
 *   ・30日アーカイブ：Supabase に残った古いファイルを、ドライブへ移す（合言葉 ARCHIVE_TOKEN が要ります）
 *   ・広告の映像：ドライブの「広告」フォルダの AD001.mp4〜 を、チャットに渡す（?action=list／?action=part）
 *   ・いざというとき用：keepAlive（Supabase を眠らせない。週1回のトリガーに設定して使う。ふだんは何もしません）
 *
 * 使い方：このコード全部を、いまの「ファイル保存」プロジェクトに貼り直して保存 → 「デプロイ」→「デプロイを管理」→ えんぴつ →
 *         バージョン「新バージョン」→「デプロイ」。（こうすると URL が変わりません。「動画保存」のプロジェクトは もう使いません）
 */
var CONFIG = {
  // ファイル保存フォルダ（https://drive.google.com/drive/folders/ のあとの文字）
  FOLDER_ID: '1W60advMCNRxEWyhTeyX-MP5yO1-wniZX',
  // 1つあたりの上限（バイト）
  MAX_BYTES: 1000 * 1024 * 1024 * 1024,
  // 1人が1日にあずけられる上限（いたずらで ドライブがいっぱいになるのを防ぐ）
  DAILY_MAX_FILES: 1000,
  DAILY_MAX_BYTES: 100 * 1024 * 1024 * 1024,
  // ログイン確認に使う Supabase（公開してよい値だけ）
  SUPABASE_URL: 'https://kzrrnuzzvwijujhlbtln.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_lO7m63Or44b-CIRWfYMcjA_z_WuONpi',
  // チャットのアドレス（ブラウザからドライブへ直接アップロードできるようにするために必要）
  ALLOWED_ORIGIN: 'https://arechat.github.io',
  // 月ごとのフォルダ名に使う時間帯
  TZ: 'Asia/Tokyo'
};

// ドライブに置けない（実行できる・危ない）ファイルの種類。チャットの「送れないファイル」と合わせています
var BLOCKED_EXT = /\.(exe|bat|cmd|com|msi|msp|apk|ipa|sh|bash|zsh|ps1|psm1|vbs|vbe|wsf|wsh|hta|scr|pif|jar|dll|sys|lnk|reg|js|svg|xml|xhtml|docm|xlsm|pptm|dotm|xlsb|app|pkg|dmg|deb|rpm)$/i;

// ===== 入り口 =====
function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'start' || body.action === 'finish') {
      var uid = verifyUser_(body.token);
      return json_(body.action === 'start' ? start_(uid, body) : finish_(uid, body));
    }
    if (body.url) return json_(archive_(body));   // 30日アーカイブ（合言葉つき）
    return json_({ ok: false, message: '不明な操作です。' });
  } catch (err) {
    return json_({ ok: false, message: String(err && err.message ? err.message : err), error: String(err).slice(0, 200) });
  }
}

// 動作確認：ブラウザでウェブアプリの URL を開くと、この文字が出ます。広告の映像も ここから配ります
function doGet(e) {
  var a = (e && e.parameter) || {};
  try {
    if (a.action === 'list') return json_(adsList_());
    if (a.action === 'part') return json_(adsPart_(String(a.id || ''), parseInt(a.i, 10)));
  } catch (err) {
    return json_({ ok: false, error: String(err).slice(0, 200) });
  }
  return ContentService.createTextOutput('ファイル保存の受け口は動いています。');
}

// ===== 1) アップロード口を作る =====
function start_(uid, body) {
  var size = Number(body.size) || 0;
  var kind = { video: 1, image: 1, audio: 1, file: 1 }[body.kind] ? body.kind : 'file';
  var name = String(body.name || kind).replace(/[\u0000-\u001f\\/]/g, '_').slice(0, 120);
  var mime = String(body.mime || (kind === 'video' ? 'video/mp4' : 'application/octet-stream')).slice(0, 100);
  var word = { video: '動画', image: '写真', audio: '音声', file: 'ファイル' }[kind];
  // 種類のチェック（実行できる・危ないものは ことわる。チャット側でも同じ種類を止めています）
  if (kind === 'video' && !/^video\//i.test(mime)) throw new Error('動画ファイルだけ送れます。');
  if (kind === 'image' && (!/^image\//i.test(mime) || /svg/i.test(mime))) throw new Error('写真（画像）ファイルだけ送れます。');
  if (kind === 'audio' && !/^audio\//i.test(mime)) throw new Error('音声ファイルだけ送れます。');
  if (BLOCKED_EXT.test(name)) throw new Error('この種類のファイルは、安全のため送れません。');
  if (size <= 0) throw new Error(word + 'の大きさを確認できませんでした。');
  if (size > CONFIG.MAX_BYTES) throw new Error(word + 'は1つ ' + Math.floor(CONFIG.MAX_BYTES / 1048576) + 'MB までです。');
  var today = usedToday_(uid);
  if (today.files >= CONFIG.DAILY_MAX_FILES) throw new Error('今日あずけられる数（' + CONFIG.DAILY_MAX_FILES + ' 個）をこえました。あしたまたお試しください。');
  if (today.bytes + size > CONFIG.DAILY_MAX_BYTES) throw new Error('今日あずけられる量をこえました。あしたまたお試しください。');
  var meta = {
    name: name,
    parents: [monthFolder_().getId()],
    appProperties: { uid: uid, created: String(Date.now()), kind: kind, sz: String(size) }
  };
  var res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    payload: JSON.stringify(meta),
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'X-Upload-Content-Type': mime,
      'X-Upload-Content-Length': String(size),
      // これがあると、ブラウザからこのアップロード口へ直接送れるようになります
      Origin: CONFIG.ALLOWED_ORIGIN
    },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('ドライブのアップロード口を作れませんでした（' + res.getResponseCode() + '）。');
  var headers = res.getAllHeaders();
  var loc = headers.Location || headers.location;
  if (!loc) throw new Error('ドライブのアップロード口を受け取れませんでした。');
  return { ok: true, sessionUrl: loc, maxBytes: CONFIG.MAX_BYTES, retentionDays: 0 };
}

// ===== 3) 全員が見られるようにして、リンクを返す =====
function finish_(uid, body) {
  var id = String(body.fileId || '');
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) throw new Error('ファイルの番号が正しくありません。');
  var info = JSON.parse(UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id + '?fields=appProperties,name,size&supportsAllDrives=true', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
  }).getContentText());
  var props = info.appProperties || {};
  // 自分がアップロードしたものだけ 公開できる
  if (props.uid !== uid) throw new Error('このファイルは公開できません。');
  var file = DriveApp.getFileById(id);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, id: id, link: 'https://drive.google.com/file/d/' + id + '/view', name: info.name || file.getName(), retentionDays: 0 };
}

// ===== 30日アーカイブ（Supabase に残った古いファイルを ドライブへ移す。合言葉 ARCHIVE_TOKEN が要ります）=====
function archive_(body) {
  var token = PropertiesService.getScriptProperties().getProperty('ARCHIVE_TOKEN');
  if (!token || String(body.token || '') !== token) return { ok: false, error: 'forbidden' };
  var url = String(body.url || '');
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/sign\//.test(url)) return { ok: false, error: 'bad url' };
  var name = cleanName_(body.name);
  var sub = monthFolder_(/^\d{4}-\d{2}$/.test(String(body.month || '')) ? String(body.month) : 'unknown');
  // 同じ名前がすでにあれば、保存しなおさない（やり直しで二重にならないように）
  var same = sub.getFilesByName(name);
  if (same.hasNext()) return { ok: true, id: same.next().getId(), name: name, duplicate: true };
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { ok: false, error: 'fetch ' + res.getResponseCode() };
  var file = sub.createFile(res.getBlob().setName(name));
  return { ok: true, id: file.getId(), name: name, size: file.getSize() };
}

// ===== 自動削除はしません（古い設定で「毎日 cleanup」を動かしていても、何も消しません）=====
function cleanup() {
  console.log('自動削除は しない設定です（何も消していません）');
}

// ===== 広告の映像の配信（チャットが 1時間ごとに 15秒の映像を流す）=====
// ・ドライブの「広告」フォルダ（マイドライブの直下）にある AD001.mp4 〜 AD100.mp4 を、チャットの画面に渡します。
// ・合言葉は要りません（広告は だれに見られてもよいもの）。AD+3けたの名前の mp4 だけを渡し、ほかのファイルには さわりません。
// ・フォルダが別のアカウントにあるときは、スクリプトのプロパティ ADS_FOLDER_ID にフォルダの番号を入れます。
var ADS_FOLDER_NAME = '広告';
var ADS_PART_BYTES = 3 * 1024 * 1024;

function adsFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty('ADS_FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  var it = DriveApp.getRootFolder().getFoldersByName(ADS_FOLDER_NAME);
  if (!it.hasNext()) throw new Error('広告フォルダが見つかりません');
  return it.next();
}

function adsList_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('adslist');
  if (hit) return JSON.parse(hit);
  var out = [], it = adsFolder_().getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var m = /^(AD\d{3})\.mp4$/i.exec(f.getName());
    if (!m) continue;
    var size = f.getSize();
    out.push({ id: m[1].toUpperCase(), size: size, parts: Math.ceil(size / ADS_PART_BYTES), v: f.getLastUpdated().getTime() });
  }
  out.sort(function (x, y) { return x.id < y.id ? -1 : 1; });
  var res = { ok: true, partBytes: ADS_PART_BYTES, ads: out };
  cache.put('adslist', JSON.stringify(res), 300);   // 5分だけ控える（動画を足したら、5分以内に反映）
  return res;
}

function adsPart_(id, i) {
  if (!/^AD\d{3}$/.test(id) || !(i >= 0)) throw new Error('bad request');
  var it = adsFolder_().getFilesByName(id + '.mp4');
  if (!it.hasNext()) throw new Error('not found');
  var bytes = it.next().getBlob().getBytes();
  var start = i * ADS_PART_BYTES;
  if (start >= bytes.length) throw new Error('bad part');
  return { ok: true, i: i, b64: Utilities.base64Encode(bytes.slice(start, Math.min(bytes.length, start + ADS_PART_BYTES))) };
}

// ===== いざというとき用：Supabase を眠らせない（週1回の軽い呼び出し）=====
// ・毎日チャットが使われているあいだは、設定しなくてOKです（ふだんは何もしません）。
// ・使われない日が続きそうなとき：GAS の左のメニュー「トリガー」→「トリガーを追加」→
//   実行する関数＝keepAlive ／ イベントのソース＝時間主導型 ／ 週ベースのタイマー（毎週 月曜 など）→ 保存。
// ・呼び先は Supabase の関数 keepalive_v1（時刻を返すだけ。テーブルには さわりません）。
function keepAlive() {
  var res = UrlFetchApp.fetch(CONFIG.SUPABASE_URL + '/rest/v1/rpc/keepalive_v1', {
    method: 'post',
    contentType: 'application/json',
    payload: '{}',
    headers: { apikey: CONFIG.SUPABASE_PUBLISHABLE_KEY },
    muteHttpExceptions: true
  });
  console.log('keepAlive: ' + res.getResponseCode() + ' ' + String(res.getContentText()).slice(0, 80));
  return res.getResponseCode();
}

// ===== 道具 =====
function verifyUser_(token) {
  if (!token) throw new Error('ログインが確認できません。');
  var res = UrlFetchApp.fetch(CONFIG.SUPABASE_URL + '/auth/v1/user', {
    headers: { Authorization: 'Bearer ' + token, apikey: CONFIG.SUPABASE_PUBLISHABLE_KEY },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('ログインが確認できません。もう一度ログインしてください。');
  var u = JSON.parse(res.getContentText());
  if (!u || !u.id) throw new Error('ログインが確認できません。');
  return String(u.id);
}

// このひとが、きょう（24時間）にあずけた 数と量
function usedToday_(uid) {
  var since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  var q = "trashed=false and appProperties has { key='uid' and value='" + uid + "' } and createdTime > '" + since + "'";
  var res = JSON.parse(UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files?pageSize=1000&fields=files(appProperties)&supportsAllDrives=true&includeItemsFromAllDrives=true&q=' + encodeURIComponent(q), {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
  }).getContentText());
  var files = res.files || [], bytes = 0;
  for (var i = 0; i < files.length; i++) bytes += Number((files[i].appProperties || {}).sz) || 0;
  return { files: files.length, bytes: bytes };
}

// ファイル保存フォルダの中の「2026-11」のような月フォルダ（なければ作る）
function monthFolder_(month) {
  var m = month || Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM');
  var root = DriveApp.getFolderById(CONFIG.FOLDER_ID);   // 開けない（権限がない・IDがちがう）ときは、ここでエラーになります
  var it = root.getFoldersByName(m);
  return it.hasNext() ? it.next() : root.createFolder(m);
}

function cleanName_(s) {
  return String(s || 'file').replace(/[\\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 180) || 'file';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
