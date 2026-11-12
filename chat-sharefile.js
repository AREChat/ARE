"use strict";
// ===== 作ったファイルを LINE などに共有 =====
// ・ZIP／ファイルツールで保存したあと、画面の下に「📤 共有」ボタンを 20秒だけ出します。
// ・対応している端末（スマホなど）では、LINE・メール・AirDrop などへ ファイルごと送れます。
// ・非対応（多くのパソコン）では、LINEにことばだけ送る／コピー、のどちらかを選べます。
const shf = {blob: null, name: "", timer: 0};

function shareOffer(blob, name){
    shf.blob = blob; shf.name = name;
    let bar = document.getElementById("shfBar");
    if(!bar){
        bar = document.createElement("div"); bar.id = "shfBar"; bar.className = "shf-bar";
        bar.innerHTML = '<button type="button" class="shf-go" data-shf="go">📤 共有</button><span class="shf-name"></span><button type="button" class="shf-x" data-shf="x" aria-label="閉じる">✕</button>';
        document.body.appendChild(bar);
        bar.addEventListener("click", (e) => { const b = e.target.closest("[data-shf]"); if(b) shareFileAction(b.dataset.shf); });
    }
    bar.querySelector(".shf-name").textContent = name;
    bar.hidden = false;
    clearTimeout(shf.timer); shf.timer = setTimeout(() => { bar.hidden = true; }, 20000);
}

async function shareFileAction(a){
    const bar = document.getElementById("shfBar");
    if(a === "x"){ if(bar) bar.hidden = true; return; }
    if(!shf.blob) return;
    const file = new File([shf.blob], shf.name, {type: shf.blob.type || "application/octet-stream"});
    try{
        if(navigator.canShare && navigator.canShare({files: [file]})){ await navigator.share({files: [file], title: shf.name}); return; }
    }catch(e){ if(e && e.name === "AbortError") return; }
    // ファイル共有できない：選んでもらう
    openSheet('<h3>共有する</h3><p class="meta">この端末では、ファイルを直接 送れません。保存したファイル「' + String(shf.name).replace(/[<>&"]/g, "") + '」を、LINEなどに 添付してください。</p>' +
        '<div class="tool-actions"><button type="button" class="primary" data-t="shf:line">💬 LINEで ことばだけ送る</button><button type="button" data-t="shf:copy">📋 ファイル名をコピー</button></div>' + toolClose());
}
function onShfAction(action){
    const text = "ARE で作ったファイル：" + shf.name;
    if(action === "line"){ window.open("https://line.me/R/msg/text/?" + encodeURIComponent(text), "_blank", "noopener"); }
    else if(action === "copy"){ try{ navigator.clipboard.writeText(text); showToast("コピーしました。"); }catch(_e){ showToast("コピーできませんでした。"); } }
}
function initShareFile(){ registerTool("shf", onShfAction); }
