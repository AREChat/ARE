"use strict";
// ===== 全画面（ブラウザのタブ・⋮メニュー・ツールバーを隠して、ARE だけを大きく映す）=====
// ・ページの側から、ブラウザの ⋮ メニューなどを「消す」ことはできません（ブラウザの決まり）。
//   かわりに、全画面にすると、それらが 見えなくなります（Chrome・Edge・Android）。やめるときは Esc か、もう一度このツール。
// ・iPhone の Safari には、全画面の仕組みがありません。「ホーム画面に追加」して開くと、Safari のメニューが 出なくなります。
function fsEl(){ return document.documentElement; }
function fsSupported(){ const d = fsEl(); return !!(d.requestFullscreen || d.webkitRequestFullscreen); }
function fsActive(){ return !!(document.fullscreenElement || document.webkitFullscreenElement); }

function openFullscreenTool(){
    if(!fsSupported()){
        showToast("このブラウザでは、全画面にできません。iPhone は、Safari の共有ボタンから「ホーム画面に追加」して開くと、Safari のメニューが出なくなります。");
        return;
    }
    try{
        if(fsActive()){
            (document.exitFullscreen || document.webkitExitFullscreen).call(document);
            showToast("全画面をやめました。");
            return;
        }
        const d = fsEl(), req = d.requestFullscreen || d.webkitRequestFullscreen;
        const p = req.call(d, {navigationUI: "hide"});
        if(p && typeof p.catch === "function") p.catch(() => showToast("全画面にできませんでした。もう一度おためしください。"));
        showToast("全画面にしました。やめるときは、Esc キーか、もう一度このボタンを押します。");
    }catch(_e){
        showToast("全画面にできませんでした。");
    }
}

function initFullscreen(){ /* 入口は「その他」のツール一覧から出ます。ここでは何もしません */ }
