"use strict";
// ===== 🆘 緊急ボタン：管理者と直接チャットでやりとりする（電話はできません） =====
// ・「その他」タブの上に出ます（管理者本人には出ません）。操作ガイドの「緊急ボタン」リンク（chat.html?emergency=1）からも開けます。
// ・家庭・その他グループなど、直接チャットが許可されていない人は、これまでの「管理者への連絡」の部屋が開きます。
const EMG_ADMIN_ID = "9d660098-27f5-4933-bdce-d0ea7a6f08b4";

async function emgOpen(){
    if(feat.isAdmin === true){ showToast("管理者のアカウントです。ユーザーからの連絡は、チャット一覧に届きます。"); return; }
    if(typeof closeSheet === "function") try{ closeSheet(); }catch(_e){ /* 何もしない */ }
    if(typeof setTab === "function") setTab("chats");
    await openOrCreateDirectChat(EMG_ADMIN_ID);
}
function emgPaint(){
    const b = document.getElementById("emgBtn"); if(b) b.hidden = feat.isAdmin === true;
}
function initEmergency(){
    const pane = document.querySelector(".pane-more");
    if(pane && !document.getElementById("emgBtn")){
        const b = document.createElement("button");
        b.type = "button"; b.id = "emgBtn"; b.className = "admin-card more-item"; b.setAttribute("data-keep", "1");
        b.style.cssText = "border-color:#e0476b;background:rgba(224,71,107,.12);width:100%;text-align:left";
        b.innerHTML = "🆘 緊急ボタン<small class=\"meta\" style=\"display:block\">困ったとき、管理者とチャットで直接やりとりできます（電話はできません）</small>";
        b.addEventListener("click", () => { runTool(emgOpen); });
        const head = pane.querySelector(".section-heading");
        if(head) head.insertAdjacentElement("afterend", b); else pane.insertAdjacentElement("afterbegin", b);
    }
    emgPaint();
    if(typeof setTab === "function"){
        const orig = setTab;
        setTab = function(){ const r = orig.apply(this, arguments); try{ emgPaint(); }catch(_e){ /* 何もしない */ } return r; };
    }
    let want = false;
    try{ want = new URLSearchParams(location.search).get("emergency") === "1"; }catch(_e){ /* 何もしない */ }
    if(want){
        let n = 0;
        const t = setInterval(() => {
            n++;
            if(state.user && Array.isArray(state.rooms) && feat.isAdmin !== undefined && feat.isAdmin !== null){
                clearInterval(t);
                try{ history.replaceState(null, "", location.pathname); }catch(_e){ /* 何もしない */ }
                runTool(emgOpen);
            }else if(n > 60) clearInterval(t);
        }, 500);
    }
}
