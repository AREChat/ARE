"use strict";
// ===== 「アプリとして追加」の準備（早めに受けとる） =====
// ・Android の Chrome／Windows・Mac の Chrome・Edge は、ページを開いた直後に「インストールできます」という合図（beforeinstallprompt）を出します。
//   この合図は 1回しか出ないので、ほかの JS が読みこまれるのを待たず、ここで先に受けとっておきます（受けとった合図は window.__areInstallEvent に置く）。
// ・iPhone／iPad にはこの合図がありません（Apple の決まり）。その場合は、画面の案内（chat-hdr.js）で「共有 →『ホーム画面に追加』」を ご案内します。
(function(){
    window.addEventListener("beforeinstallprompt", function(e){ e.preventDefault(); window.__areInstallEvent = e; try{ window.dispatchEvent(new CustomEvent("are-install-ready")); }catch(_e){} });
    window.addEventListener("appinstalled", function(){ window.__areInstallEvent = null; try{ window.dispatchEvent(new CustomEvent("are-installed")); }catch(_e){} });
})();
