"use strict";
// ===== すれ違いタウンへの入口を、チャット一覧（左の一覧）の いちばん上に固定表示する =====
// ・実際の「部屋」ではないので、見た目だけ room-item と同じボタンを、一覧の先頭に差し込む。
// ・表示する・しない／新しいすれ違いの数のバッジは、chat-passby.js の pbPaintCard() にまかせる
//   （data-tool="passby" を付けておけば、その他タブの入口と同じ仕組みで自動的に出し分けられる＝ゲストには出ない）。
function pbPinPaint(){
    const list = el && el.roomList; if(!list) return;
    let btn = list.querySelector(".pb-pin-entry");
    if(!btn){
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "room-item pb-pin-entry";
        btn.dataset.tool = "passby";
        btn.innerHTML = '<div class="avatar">📡</div><span class="person-text"><strong>📌 すれ違いタウン</strong><small>近くにいた人と、自動ですれ違い</small></span>';
        btn.addEventListener("click", () => {
            if(typeof runTool === "function" && typeof openPassby === "function") runTool(() => openPassby());
        });
    }
    if(list.firstElementChild !== btn) list.insertAdjacentElement("afterbegin", btn);
    if(typeof pbPaintCard === "function") pbPaintCard();   // 表示・非表示とバッジは、すれ違いタウン側の仕組みにまかせる
}
function initPassbyPin(){
    if(typeof renderRooms !== "function") return;
    const orig = renderRooms;
    renderRooms = function(){
        const r = orig.apply(this, arguments);
        try{ pbPinPaint(); }catch(e){ console.error("[ARE passby-pin]", e); }
        return r;
    };
    if(el && el.roomList) pbPinPaint();
}
