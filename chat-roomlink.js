"use strict";
// ===== チャットごとの「ピン留めリンク」ボタン =====
// ・chat_rooms に pinned_link_url／pinned_link_label を持たせておくと、そのチャットのヘッダーに
//   ボタンが出て、押すと新しいタブでそのリンクへ飛べます（例：特定の相手とだけ共有している日誌シート）。
// ・ふつうは何も設定されていないので、ボタンは出ません（非表示のまま）。
(function(){
    function paint(room){
        const btn = feat.roomlink && feat.roomlink.btn; if(!btn) return;
        const url = room && typeof room.pinned_link_url === "string" ? room.pinned_link_url.trim() : "";
        if(!room || !url || !safeHttpUrl(url)){ btn.hidden = true; btn.onclick = null; return; }
        const label = (room.pinned_link_label && String(room.pinned_link_label).trim()) || "日誌";
        btn.hidden = false;
        btn.textContent = "📔";
        btn.title = label + "を開く";
        btn.setAttribute("aria-label",label + "を開く");
        btn.onclick = () => { try{ window.open(safeHttpUrl(url),"_blank","noopener"); }catch(_e){} };
    }

    function initRoomLink(){
        feat.roomlink = {btn:null};
        const head = document.querySelector(".chat-header"), anchor = document.getElementById("refreshMessagesButton");
        if(head && anchor){
            const b = document.createElement("button");
            b.type = "button"; b.id = "roomLinkBtn"; b.className = "button-secondary"; b.hidden = true;
            head.insertBefore(b,anchor);
            feat.roomlink.btn = b;
        }
        addRoomHook((room) => { try{ paint(room); }catch(_e){} });
    }

    window.initRoomLink = initRoomLink;
})();
