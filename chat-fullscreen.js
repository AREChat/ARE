"use strict";
// ===== 全画面（ブラウザのタブ・⋮メニュー・ツールバーを隠して、ARE だけを大きく映す）=====
// ・初期設定は「オン」：最初のタップやキー操作で、自動で全画面になります（protect.js の中の「8) 全画面」）。
//   ブラウザの決まりで、操作なしには全画面にできないためです。ページを移るたびに、最初の操作で また入ります。
// ・このツールは、オンとオフの切りかえです。オフにすると、次からも自動では入りません（もう一度押すとオンに戻ります）。
// ・Esc でやめたときは、そのタブでは自動で入りなおしません。このツールを押すと、また入ります。
// ・ページの側から、ブラウザの ⋮ メニューそのものを「消す」ことはできません（ブラウザの決まり）。全画面にすると、見えなくなります（Chrome・Edge・Android）。
// ・iPhone の Safari には、全画面の仕組みがありません。「ホーム画面に追加」して開くと、Safari のメニューが出なくなります。
//   Android も、「ホーム画面に追加」で開くと、全画面のアプリとして始まります。
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
            try{ localStorage.setItem("are_fs_off", "1"); }catch(_e){ /* 何もしない */ }
            (document.exitFullscreen || document.webkitExitFullscreen).call(document);
            showToast("全画面をやめました。次からも、自動では全画面にしません。もう一度このボタンを押すと、また自動でオンになります。");
            return;
        }
        try{ localStorage.removeItem("are_fs_off"); sessionStorage.removeItem("are_fs_left"); }catch(_e){ /* 何もしない */ }
        const d = fsEl(), req = d.requestFullscreen || d.webkitRequestFullscreen;
        const p = req.call(d, {navigationUI: "hide"});
        if(p && typeof p.catch === "function") p.catch(() => showToast("全画面にできませんでした。もう一度おためしください。"));
        showToast("全画面にしました（次からも、自動で全画面になります）。やめるときは、Esc キーか、もう一度このボタンを押します。");
    }catch(_e){
        showToast("全画面にできませんでした。");
    }
}

function initFullscreen(){ /* 入口は「その他」のツール一覧から出ます。自動で入る処理は、protect.js にあります */ }
