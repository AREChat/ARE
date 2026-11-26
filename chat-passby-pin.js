"use strict";
// ===== すれ違いタウンへの入口を、チャット画面の いちばん上の行（グループ作成・友達追加・すべて と同じ行）に、アイコンだけで出す =====
// ・実際の「部屋」ではないので、見た目だけ ボタンを差し込む（以前は 一覧の先頭に 文字つきで 出していました）。
// ・表示する・しない／新しいすれ違いの数のバッジは、chat-passby.js の pbPaintCard() にまかせる
//   （data-tool="passby" を付けておけば、その他タブの入口と同じ仕組みで自動的に出し分けられる＝ゲストには出ない）。
function pbPinPaint(){
    const list = el && el.roomList; if(!list) return;
    const old = list.querySelector(".pb-pin-entry"); if(old) old.remove();   // 以前の「一覧の先頭の文字つき入口」は もう出さない
    const heading = document.querySelector(".pane-chats .section-heading"); if(!heading) return;
    let btn = document.getElementById("pbPinIcon");
    if(!btn){
        btn = document.createElement("button");
        btn.type = "button"; btn.id = "pbPinIcon";
        btn.className = "button-secondary pb-pin-icon";
        btn.dataset.tool = "passby";
        btn.title = "すれ違いタウン（近くにいた人と、自動ですれ違い）";
        btn.setAttribute("aria-label", "すれ違いタウン");
        btn.textContent = "📡";
        btn.style.cssText = "position:relative;padding:4px 10px;font-size:18px;line-height:1.2";
        btn.addEventListener("click", () => {
            if(typeof runTool === "function" && typeof openPassby === "function") runTool(() => openPassby());
        });
    }
    if(btn.parentNode !== heading || heading.lastElementChild !== btn) heading.appendChild(btn);   // 同じ行の いちばん右
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
    feat.timers.push(setInterval(() => { try{ pbPinPaint(); }catch(_e){} }, 4000));   // 友達追加・すべて などが あとから増えても いちばん右に そろえる
}
