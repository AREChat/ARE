/* ARE ガード（クラシックscript）
   ・右クリック／長押しメニュー、F12、開発者ツールのショートカット、ソース表示、保存、印刷 を ふさぐ
   ・F5（さいよみこみ）と F11（全画面）、Esc、矢印、Space、Enter、文字キー など あそぶのに ひつようなキーは のこす
   ※かんたんな ぼうしだけで、完全には ふせげません。開発するときは URL のおわりに ?dev=1（localhost は じどうで ゆるす）*/
(function(){
    if(window.__areGuard) return; window.__areGuard = 1;
    var q = location.search, host = location.hostname;
    if(/[?&]dev=1/.test(q) || host === "localhost" || host === "127.0.0.1" || host === "") return;
    var KEEP_F = {F5: 1, F11: 1};
    addEventListener("contextmenu", function(e){ e.preventDefault(); }, true);
    addEventListener("keydown", function(e){
        var k = e.key || "", c = e.ctrlKey || e.metaKey, s = e.shiftKey, bad = false;
        if(/^F([1-9]|1[0-9]|2[0-4])$/.test(k) && !KEEP_F[k]) bad = true;                 // F12 ほか
        else if(k === "ContextMenu" || (s && k === "F10")) bad = true;                   // メニューキー
        else if(c && s && /^[ijckeIJCKE]$/.test(k)) bad = true;                         // 開発者ツール
        else if(c && /^[uUsSpPoO]$/.test(k)) bad = true;                                 // ソース・保存・印刷・開く
        else if(c && s && /^(Delete|Backspace)$/.test(k)) bad = true;
        if(bad){ e.preventDefault(); e.stopPropagation(); }
    }, true);
    addEventListener("dragstart", function(e){ e.preventDefault(); }, true);
})();
