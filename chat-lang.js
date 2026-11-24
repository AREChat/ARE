"use strict";
// ===== 多言語UI（日本語 / English / 中文 / 한국어）=====
// 本体は i18n.js（全ページ共通・最初に読みこむ）。ここは チャット画面の「設定」と つなぐだけ。
// 日本語は何もしない。ほかの言語は、画面に出た文字を 辞書（lazy/i18n-*.js）で置きかえる。

function initLang(){
    registerTool("lang", () => {});
    try{ if(window.AREI18N && AREI18N.lang !== prefGet("are_lang", "ja")) AREI18N.set(prefGet("are_lang", "ja")); }catch(_e){}
}

function applyLanguage(lang){
    try{ if(window.AREI18N) AREI18N.set(lang); }catch(_e){}
}

/** 画面に出す文を、いまの言語に直す（辞書にない文は、そのまま日本語で返す） */
function T(text, vars){
    try{ if(window.AREI18N) return AREI18N.t(text, vars); }catch(_e){}
    return text;
}
function langCode(){ try{ return window.AREI18N ? AREI18N.lang : "ja"; }catch(_e){ return "ja"; } }
