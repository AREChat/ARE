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
 *   ・30日アーカイブ：Supabase に残った古いファイルを、ドライブへ移す（合言葉 ARCHIVE_TOKEN が要ります。写真は share:true で公開リンクにして移せます）
 *   ・広告の映像：ドライブの「広告」フォルダの AD001.mp4〜 を、チャットに渡す（?action=list／?action=part）
 *   ・天気・運行情報：都道府県ごとの天気と都営交通の運行状況を、ここで集めて チャットに渡す（?action=info）。Supabase は使いません
 *   ・通話：着信のよびだしと、つなぎの相談を、ここの「郵便受け」で受けわたす（action=call）。声や映像は ここを通りません（ブラウザどうしが直接つなぐ）。Supabase は ほぼ使いません
 *   ・いざというとき用：keepAlive（Supabase を眠らせない。週1回のトリガーに設定して使う。ふだんは何もしません）
 *
 * 使い方：このコード全部を、いまの「ファイル保存」プロジェクトに貼り直して保存 → 「デプロイ」→「デプロイを管理」→ えんぴつ →
 *         バージョン「新バージョン」→「デプロイ」。（こうすると URL が変わりません。「動画保存」のプロジェクトは もう使いません）
 */
var CONFIG = {
  // ファイル保存フォルダ（https://drive.google.com/drive/folders/ のあとの文字）
  FOLDER_ID: '1W60advMCNRxEWyhTeyX-MP5yO1-wniZX',
  // 1つあたりの上限（バイト）
  MAX_BYTES: 10000 * 1024 * 1024 * 1024,
  // 1人が1日にあずけられる上限（いたずらで ドライブがいっぱいになるのを防ぐ）
  DAILY_MAX_FILES: 10000,
  DAILY_MAX_BYTES: 1000 * 1024 * 1024 * 1024,
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
    if (body.action === 'call') return json_(callApi_(body));   // 通話の郵便受け
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
    if (a.action === 'info') return json_(infoGet_(String(a.kind || ''), String(a.key || '')));
    if (a.action === 'ping') return json_({ ok: true, version: '2026-11-25-call', features: ['info', 'archive-share', 'call'] });   // どの版が動いているかの確認用
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
  // share:true のときは「リンクを知っている全員が見られる」にします（写真をチャットや投稿に そのまま出すため。ドライブへ移した写真用）
  var share = body.share === true;
  // 同じ名前がすでにあれば、保存しなおさない（やり直しで二重にならないように）
  var same = sub.getFilesByName(name);
  if (same.hasNext()) {
    var old = same.next();
    if (share) old.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { ok: true, id: old.getId(), name: name, size: old.getSize(), duplicate: true, shared: share };
  }
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { ok: false, error: 'fetch ' + res.getResponseCode() };
  var file = sub.createFile(res.getBlob().setName(name));
  if (share) file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, id: file.getId(), name: name, size: file.getSize(), shared: share };
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

// ===== 天気・運行情報（これまで Supabase が1時間ごとに集めていたもの）=====
// ・チャットが ?action=info&kind=weather&key=13（都道府県コード）／ kind=transit&key=toei で聞きにきます。
// ・結果は GAS の一時メモ（CacheService）に 30分（運行情報は5分）あずかるので、何人が見ても 外への問い合わせは少しだけ。
// ・トリガーの設定は要りません（聞かれたときに、古ければ取りにいく）。取れなかったときは 直前にうまくいった結果（最大6時間）を返します。
// ・天気：Open-Meteo（無料・キー不要）／ 運行：公共交通オープンデータセンター（東京都交通局・CC BY 4.0・キー不要）
var INFO_PREFS = [
  ['01','北海道',43.0642,141.3469],['02','青森県',40.8244,140.74],['03','岩手県',39.7036,141.1527],['04','宮城県',38.2688,140.8721],
  ['05','秋田県',39.7186,140.1024],['06','山形県',38.2404,140.3633],['07','福島県',37.7503,140.4676],['08','茨城県',36.3418,140.4468],
  ['09','栃木県',36.5658,139.8836],['10','群馬県',36.3911,139.0608],['11','埼玉県',35.857,139.6489],['12','千葉県',35.6047,140.1233],
  ['13','東京都',35.6895,139.6917],['14','神奈川県',35.4478,139.6425],['15','新潟県',37.9026,139.0236],['16','富山県',36.6953,137.2113],
  ['17','石川県',36.5947,136.6256],['18','福井県',36.0652,136.2216],['19','山梨県',35.6642,138.5684],['20','長野県',36.6513,138.181],
  ['21','岐阜県',35.3912,136.7223],['22','静岡県',34.9769,138.3831],['23','愛知県',35.1802,136.9066],['24','三重県',34.7303,136.5086],
  ['25','滋賀県',35.0045,135.8686],['26','京都府',35.0214,135.7556],['27','大阪府',34.6937,135.5023],['28','兵庫県',34.6913,135.183],
  ['29','奈良県',34.6851,135.8049],['30','和歌山県',34.2261,135.1675],['31','鳥取県',35.5039,134.2383],['32','島根県',35.4723,133.0505],
  ['33','岡山県',34.6618,133.9344],['34','広島県',34.3963,132.4596],['35','山口県',34.1861,131.4706],['36','徳島県',34.0658,134.5593],
  ['37','香川県',34.3401,134.0434],['38','愛媛県',33.8416,132.7657],['39','高知県',33.5597,133.5311],['40','福岡県',33.6064,130.4181],
  ['41','佐賀県',33.2494,130.2988],['42','長崎県',32.7503,129.8777],['43','熊本県',32.7898,130.7417],['44','大分県',33.2382,131.6126],
  ['45','宮崎県',31.9111,131.4239],['46','鹿児島県',31.5602,130.5581],['47','沖縄県',26.2124,127.6809]
];
var TOEI_NAMES = { Asakusa: '浅草線', Mita: '三田線', Shinjuku: '新宿線', Oedo: '大江戸線', Arakawa: '都電荒川線', NipporiToneri: '日暮里・舎人ライナー' };
var INFO_FRESH_SEC = { weather: 1800, transit: 300 };   // この時間は、そのまま返す
var INFO_KEEP_SEC = 21600;                              // 取れなかったときのための「直前の結果」（CacheService の上限は6時間）

function infoGet_(kind, key) {
  var cache = CacheService.getScriptCache();
  if (kind !== 'weather' && kind !== 'transit') return { ok: false, error: 'kind' };
  var ck = 'info_' + kind + '_' + key;
  var hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  var row;
  try {
    row = kind === 'weather' ? infoWeather_(key) : infoTransit_(key);
  } catch (err) {
    var last = cache.get(ck + '_last');                  // 取れなかった → 直前にうまくいった結果（古い時刻つき）を返す
    if (last) return JSON.parse(last);
    return { ok: false, payload: { error: String(err && err.message ? err.message : err).slice(0, 120) }, updated_at: new Date().toISOString() };
  }
  var text = JSON.stringify(row);
  cache.put(ck, text, INFO_FRESH_SEC[kind]);
  cache.put(ck + '_last', text, INFO_KEEP_SEC);
  return row;
}

function infoWeather_(code) {
  var p = null;
  for (var i = 0; i < INFO_PREFS.length; i++) if (INFO_PREFS[i][0] === code) p = INFO_PREFS[i];
  if (!p) throw new Error('都道府県コードがちがいます');
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + p[2] + '&longitude=' + p[3] +
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo&forecast_days=7';
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('open-meteo ' + res.getResponseCode());
  var j = JSON.parse(res.getContentText());
  if (!j || !j.current) throw new Error('open-meteo empty');
  return { ok: true, payload: { name: p[1], current: j.current, daily: j.daily }, source_url: 'https://www.jma.go.jp/bosai/forecast/', updated_at: new Date().toISOString() };
}

// 出典：東京都交通局（公共交通オープンデータセンター）
function infoTransit_(key) {
  if (key !== 'toei') throw new Error('key');
  var url = 'https://api-public.odpt.org/api/v4/odpt:TrainInformation?odpt:operator=odpt.Operator:Toei';
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'ARE-info/1.0 (+https://arechat.github.io/ARE/)' } });
  if (res.getResponseCode() !== 200) throw new Error('http ' + res.getResponseCode());
  var arr = JSON.parse(res.getContentText());
  if (!Array.isArray(arr) || !arr.length) throw new Error('empty');
  var lines = arr.map(function (x) {
    var id = String(x['odpt:railway'] || '').split('.').pop() || '';
    var t = x['odpt:trainInformationText'];
    return { name: TOEI_NAMES[id] || id, text: (t && t.ja) || '', at: x['dc:date'] || null };
  });
  return { ok: true, payload: { lines: lines, credit: '東京都交通局（公共交通オープンデータセンター・CC BY 4.0）' }, source_url: url, updated_at: new Date().toISOString() };
}

// ===== 通話（着信・音声・ビデオ・画面共有）の「郵便受け」=====
// ・声や映像は、ここを通りません。ブラウザどうしが直接つなぎます（WebRTC）。ここは「いま電話するよ」「出たよ」「切ったよ」などの短いメモを受けわたすだけです。
// ・メモは GAS の一時メモ（CacheService）に 2分だけ置き、古いものから消えます。Supabase は、電話をかけたときの本人確認（1回）でだけ使います。
// ・部屋の目印（key）は、チャットの部屋の番号を、ブラウザの中で SHA-256 にした 64文字。部屋の番号そのものは、ここには届きません。
// ・つながりにくい回線のために、無料の中継サーバー（TURN）を使うときは、スクリプトのプロパティに次の3つを入れます。入れなくても動きます（その場合は Google の公開の STUN だけ）
//     TURN_URLS＝turn:...,turns:...（カンマ区切り） ／ TURN_USER ／ TURN_PASS
//   中継の合言葉は、電話をかけたり出たりする、ログインした人にだけ返します。
var CALL = { TTL_SEC: 120, KEEP_SEC: 300, MAX_KEYS: 40, MAX_MSG: 30, MAX_DATA: 14000, POLL_MS: 6000, RING_AGE_MS: 50000 };

function callApi_(body) {
  var op = String(body.op || '');
  if (op === 'send') return callSend_(body);
  if (op === 'poll') return callPoll_(body);
  if (op === 'ice') return callIce_(body);
  return { ok: false, message: '不明な操作です。' };
}

function callKeyOk_(k) { return typeof k === 'string' && /^[0-9a-f]{64}$/.test(k); }

function callRead_(cache, k) {
  var raw = cache.get('call:' + k);
  if (!raw) return { n: 0, m: [] };
  try { var o = JSON.parse(raw); return (o && o.m) ? o : { n: 0, m: [] }; } catch (e) { return { n: 0, m: [] }; }
}

// メモを1つ置く。type：ring（かけた＋つなぎの相談の1通目）／answer／decline／cancel／hangup／busy
function callSend_(body) {
  var k = String(body.key || ''), type = String(body.type || ''), from = String(body.from || '');
  if (!callKeyOk_(k)) return { ok: false, message: 'key' };
  if (!/^(ring|answer|decline|cancel|hangup|busy)$/.test(type)) return { ok: false, message: 'type' };
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(from)) return { ok: false, message: 'from' };
  var id = String(body.id || '');
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return { ok: false, message: 'id' };
  var data = body.data == null ? '' : JSON.stringify(body.data);
  if (data.length > CALL.MAX_DATA) return { ok: false, message: 'too large' };
  // 「かける」は、ログインした人だけ（知らない人が呼び出しを送りつけるのを防ぐ）。Supabase への問い合わせは、電話1回につき1回だけです
  if (type === 'ring') verifyUser_(body.token);
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var cache = CacheService.getScriptCache();
    var box = callRead_(cache, k), now = Date.now();
    box.m = box.m.filter(function (x) { return now - x.t < CALL.TTL_SEC * 1000; });
    box.n = Math.max(now, (box.n || 0) + 1);   // 番号は「時刻」を元にする（一時メモが消えて作り直されても、番号が戻らない）
    box.m.push({ n: box.n, t: now, f: from, ty: type, id: id, d: data });
    if (box.m.length > CALL.MAX_MSG) box.m = box.m.slice(box.m.length - CALL.MAX_MSG);
    cache.put('call:' + k, JSON.stringify(box), CALL.KEEP_SEC);
    return { ok: true, n: box.n, now: now };
  } finally {
    lock.releaseLock();
  }
}

// メモを受け取る。keys：見たい部屋の目印（40まで）／ after：部屋ごとに「ここまで読んだ」番号／ me：この端末の名前（自分が置いたものは返さない）
// 一度も読んでいない部屋は、「かけた（ring）」の新しいもの（50秒以内）だけを返します
function callPoll_(body) {
  var keys = (body.keys || []).slice(0, CALL.MAX_KEYS), after = body.after || {}, me = String(body.me || '');
  var cache = CacheService.getScriptCache(), now = Date.now(), want = [];
  for (var i = 0; i < keys.length; i++) if (callKeyOk_(keys[i])) want.push(keys[i]);
  var raw = want.length ? cache.getAll(want.map(function (k) { return 'call:' + k; })) : {};
  var out = {};
  for (var j = 0; j < want.length; j++) {
    var k = want[j], r = raw['call:' + k];
    if (!r) continue;
    var box;
    try { box = JSON.parse(r); } catch (e) { continue; }
    var seen = after[k];
    var list = (box.m || []).filter(function (x) {
      if (x.f === me || now - x.t > CALL.TTL_SEC * 1000) return false;
      if (typeof seen === 'number') return x.n > seen;
      if (x.ty !== 'ring' || now - x.t > CALL.RING_AGE_MS) return false;
      // はじめて読む端末には、「もう切られた・出られた・断られた」呼び出しは見せない（幽霊の着信を防ぐ）
      for (var q = 0; q < (box.m || []).length; q++) { var y = box.m[q]; if (y.id === x.id && y.n > x.n && y.ty !== 'ring' && y.ty !== 'busy') return false; }
      return true;
    });
    if (list.length || (typeof seen !== 'number')) out[k] = { n: box.n || 0, m: list.map(function (x) { return { n: x.n, age: now - x.t, f: x.f, ty: x.ty, id: x.id, d: x.d }; }) };
  }
  return { ok: true, now: now, pollMs: CALL.POLL_MS, r: out };
}

// 無料の中継サーバー（TURN）の情報。ログインした人にだけ返します（電話1回につき、本人確認は1回）
function callIce_(body) {
  verifyUser_(body.token);
  var p = PropertiesService.getScriptProperties();
  var urls = String(p.getProperty('TURN_URLS') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var servers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (urls.length && p.getProperty('TURN_USER')) servers.push({ urls: urls, username: p.getProperty('TURN_USER'), credential: p.getProperty('TURN_PASS') || '' });
  return { ok: true, iceServers: servers, turn: urls.length > 0 };
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
