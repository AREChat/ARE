"use strict";
// ===== メッセージ操作メニューに「コピー」ボタン（📋）を追加 =====
// ・文章のメッセージに 📋 コピー ボタンを出す。押すと、その文章をそのままクリップボードにコピーする。
// ・右クリック／長押しメニューを止めている画面でも、ボタン1つで確実にコピーできるようにするための機能。
// ・「/c」つきのメッセージ（chat-copyblock.js の専用表示）は、同じ判定（cpExtractBody）でコピー対象の本文だけをコピーする。
function cpFallbackCopy(text){
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly",""); ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0,text.length);
    let ok = false; try{ ok = document.execCommand("copy"); }catch(_e){ ok = false; }
    ta.remove(); return ok;
}
function cpCopyText(text){
    const done = (ok) => { try{ showToast(ok ? "コピーしました 📋" : "コピーできませんでした。文字をなぞって、コピーしてください。"); }catch(_e){} };
    if(navigator.clipboard && window.isSecureContext){
        navigator.clipboard.writeText(text).then(() => done(true), () => done(cpFallbackCopy(text)));
    }else{ done(cpFallbackCopy(text)); }
}

function initCopyTool(){
    if(!window.AREFeatures.ok("msgmenu")) throw new Error("メッセージ操作メニューが起動していません。");
    addMsgTool({
        id:"copy", icon:"📋", label:"コピー",
        when:(m,item) => item.type === "text" && !!String(item.text || "").trim(),
        run:(m,item) => {
            const raw = String(item.text || "");
            const body = cpExtractBody(raw);
            cpCopyText(body !== null ? body : raw);
        }
    });
}
