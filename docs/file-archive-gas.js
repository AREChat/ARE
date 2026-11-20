// ===== ファイル保存フォルダ用の受け口（Google Apps Script）=====
// 使い方は docs/file-archive.md。このコード全部を、script.google.com の新しいプロジェクトに貼り付けて使います。
// ・チャットで 30 日たったファイルを、あなたの Google ドライブの「ファイル保存フォルダ」に保存します（月ごとのフォルダに分けます）。
// ・合言葉（ARCHIVE_TOKEN）が合わない呼び出しは、すべて断ります。
// ・取りにいけるのは、このアプリの保存先（Supabase Storage）の URL だけです。

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

// 動作確認用：ブラウザでウェブアプリの URL を開くと、この文字が出ます（合言葉がないので、ファイルは何も保存されません）
function doGet() {
  return ContentService.createTextOutput('ファイル保存フォルダの受け口は動いています。');
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
