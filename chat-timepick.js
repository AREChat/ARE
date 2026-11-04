"use strict";
// ===== 時刻えらび：「時」と「分」を選んで、「決定」ボタンで確定する =====
// ブラウザ標準の時刻欄は、端末（iPhone・Android・パソコン）ごとに選びかたがちがい、
// 「決定」が無いために、22:00 や 8:00 から変えられないことがあった。
// そこで、どの端末でも同じ動きになる「時」「分」の選択欄にして、
// 「決定」ボタンを押したときに、はじめて確定する作りにした（おやすみ時間・自動応答で共通）。

function tpPad(n){ return String(n).padStart(2, "0"); }

// "22:00"・"22:00:00" のような文字から、時と分を取り出す（読めないときは fallback を使う）
function tpParse(value, fallback){
    const re = /^(\d{1,2}):(\d{2})/;
    const m = re.exec(String(value == null ? "" : value).trim()) || re.exec(String(fallback || "00:00"));
    return {h: Math.min(23, Math.max(0, Number(m[1]))), m: Math.min(59, Math.max(0, Number(m[2])))};
}

// 1行分（例：「開始 [22] 時 [00] 分」）の HTML
function tpHtml(key, label, value, fallback){
    const t = tpParse(value, fallback);
    const options = (count, current) => Array.from({length: count}, (_, i) => '<option value="' + tpPad(i) + '"' + (i === current ? " selected" : "") + '>' + tpPad(i) + '</option>').join("");
    return '<div class="tp-row" data-tp="' + key + '"><span class="tp-label">' + label + '</span>' +
        '<select class="tp-h" aria-label="' + label + 'の時">' + options(24, t.h) + '</select><span class="tp-unit">時</span>' +
        '<select class="tp-m" aria-label="' + label + 'の分">' + options(60, t.m) + '</select><span class="tp-unit">分</span></div>';
}

// いま選ばれている時刻（"HH:MM"）。その行が無いときは空の文字
function tpValue(root, key){
    const row = root && root.querySelector('[data-tp="' + key + '"]');
    if(!row) return "";
    return row.querySelector(".tp-h").value + ":" + row.querySelector(".tp-m").value;
}

// 選びなおしたとき（時・分の どちらか）に onChange を呼ぶ
function tpBind(root, keys, onChange){
    keys.forEach((key) => {
        const row = root.querySelector('[data-tp="' + key + '"]');
        if(!row) return;
        row.querySelectorAll("select").forEach((node) => node.addEventListener("change", onChange));
    });
}

// 「いまの設定」の表示を、決定ずみ／まだ の2通りで書き分ける
function tpNote(noteNode, start, end, decided, extra){
    if(!noteNode) return;
    noteNode.classList.toggle("tp-dirty", !decided);
    noteNode.textContent = decided
        ? "✅ 決定ずみ：" + start + "〜" + end + (extra ? "（" + extra + "）" : "")
        : "⚠️ 変更中：" + start + "〜" + end + "（まだ決まっていません。下の「決定」ボタンを押してください）";
}
