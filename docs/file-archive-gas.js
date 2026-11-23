// ===== ファイル保存フォルダ用の受け口（Google Apps Script）=====
// 使い方は docs/file-archive.md。このコード全部を、script.google.com の新しいプロジェクトに貼り付けて使います。
// ・チャットで 30 日たったファイルを、あなたの Google ドライブの「ファイル保存フォルダ」に保存します（月ごとのフォルダに分けます）。
// ・合言葉（ARCHIVE_TOKEN）が合わない呼び出しは、すべて断ります。
// ・取りにいけるのは、このアプリの保存先（Supabase Storage）の URL だけです。
// ・同じ受け口が、Googleドライブの「広告」フォルダの映像（AD001.mp4〜）を、チャットに渡します（下の「広告の映像の配信」。合言葉は要りません）。

var ROOT_FOLDER_NAME = 'ファイル保存フォルダ';   // マイドライブの直下に作ります（すでに同じ名前のフォルダがあれば、それを使います）

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var token = PropertiesService.getScriptProperties().getProperty('ARCHIVE_TOKEN');
    if (!token || String(body.token || '') !== token) return out_({ ok: false, error: 'forbidden' });

    var url = String(body.url || '');
    if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/sign\//.test(url)) return out_({ ok: false, error: 'bad url' });

    var name = cleanName_(body.name);
    var month = /^\d{4}-\d{2}$/.test(String(body.month || '')) ? String(body.month) : 'unknown';
    var sub = folder_(folder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME), month);

    // 同じ名前がすでにあれば、保存しなおさない（やり直しで二重にならないように）
    var same = sub.getFilesByName(name);
    if (same.hasNext()) {
      var old = same.next();
      return out_({ ok: true, id: old.getId(), name: name, duplicate: true });
    }

    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return out_({ ok: false, error: 'fetch ' + res.getResponseCode() });
    var file = sub.createFile(res.getBlob().setName(name));
    return out_({ ok: true, id: file.getId(), name: name, size: file.getSize() });
  } catch (err) {
    return out_({ ok: false, error: String(err).slice(0, 200) });
  }
}

// ===== 広告の映像の配信（2027-01-01 から、チャットが 1時間ごとに 15秒の映像を流す）=====
// ・Googleドライブの「広告」フォルダ（マイドライブの直下）にある AD001.mp4 〜 AD100.mp4 を、チャットの画面に渡します。
// ・合言葉は要りません（広告は だれに見られてもよいもの）。AD+3けたの名前の mp4 だけを渡し、ほかのファイルには さわりません。
// ・フォルダが別のアカウントにあるときは、スクリプトのプロパティ ADS_FOLDER_ID にフォルダの番号を入れます（そのフォルダを、このスクリプトのアカウントと共有しておく）。
// ・使い方：?action=list → 入っている映像の一覧。?action=part&id=AD001&i=0 → 3MBずつの分割（base64）。

var ADS_FOLDER_NAME = '広告';
var ADS_PART_BYTES = 3 * 1024 * 1024;

// 動作確認用：ブラウザでウェブアプリの URL を開くと、この文字が出ます（合言葉がないので、ファイルは何も保存されません）
function doGet(e) {
  var a = (e && e.parameter) || {};
  try {
    if (a.action === 'list') return out_(adsList_());
    if (a.action === 'part') return out_(adsPart_(String(a.id || ''), parseInt(a.i, 10)));
  } catch (err) {
    return out_({ ok: false, error: String(err).slice(0, 200) });
  }
  return ContentService.createTextOutput('ファイル保存フォルダの受け口は動いています。');
}

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

function folder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function cleanName_(s) {
  return String(s || 'file').replace(/[\\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 180) || 'file';
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
