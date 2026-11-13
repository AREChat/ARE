"use strict";
// ===== つうしん障害の たいさく（会社・学校のネットで 一部の通信が止められたり、とちゅうで切れたりしたとき）=====
// ・サーバー（Supabase）への通信が つづけて失敗したら、画面の上に「通信が不安定です。自動でつなぎ直しています」と出す
// ・つながるまで 数秒ごとに こっそり ためして、つながったら 帯を消して、いまの部屋を 読みこみなおす
// ・返事が こないまま 止まる（黙って捨てられる）ときも、30秒で あきらめて 案内を出す（ぐるぐるが ずっと つづかない）
// ・入力中の文章は 消さない（送信に失敗したときは、もともと 入力欄に のこす）
// ・ゲーム用の通信（画像・動画の送信、AI の呼び出し）は 時間切れにしない（もともと 時間が かかるため）
// ※このファイルは 通信の「見はり」だけで、送る内容や 保存するものは かえません
(function(){
    if(window.__areNetWatch) return; window.__areNetWatch = 1;
    var of = window.fetch; if(typeof of !== "function") return;
    var fails = 0, down = false, firstFailAt = 0, banner = null, msgEl = null, hintEl = null, probeT = 0, probeUrl = "", probing = false, toastT = 0;
    var TIMEOUT_MS = 30000;

    function isSupa(u){ try{ return /\.supabase\.(co|in)$/i.test(new URL(u, location.href).hostname); }catch(_e){ return false; } }
    function urlOf(input){ return typeof input === "string" ? input : (input && input.url) || (input && String(input)) || ""; }
    function shortApi(u){ try{ var p = new URL(u, location.href).pathname; return /^\/(rest|auth)\/v1\//.test(p); }catch(_e){ return false; } }

    function paint(){
        if(!document.body) return;
        if(!banner){
            banner = document.createElement("div"); banner.id = "areNetWatch"; banner.setAttribute("role", "status"); banner.setAttribute("aria-live", "polite");
            banner.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);top:max(8px,env(safe-area-inset-top));z-index:2147483001;max-width:min(92vw,520px);background:#fff3cd;color:#4a3500;border:2px solid #e0a800;border-radius:14px;padding:8px 12px;font:700 13px/1.45 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);display:none;text-align:center";
            msgEl = document.createElement("div"); banner.appendChild(msgEl);
            hintEl = document.createElement("div"); hintEl.style.cssText = "font-weight:600;font-size:12px;margin-top:3px;display:none"; banner.appendChild(hintEl);
            var b = document.createElement("button"); b.type = "button"; b.textContent = "いま つなぎ直す";
            b.style.cssText = "margin-top:6px;padding:5px 14px;border-radius:999px;border:0;background:#e0a800;color:#2b1b00;font:800 12px system-ui,sans-serif;cursor:pointer";
            b.addEventListener("click", function(){ probe(true); });
            banner.appendChild(b);
            document.body.appendChild(banner);
        }
        if(down){
            msgEl.textContent = "📡 通信が不安定です。自動でつなぎ直しています（入力した文章は消えません）";
            var long = firstFailAt && Date.now() - firstFailAt > 20000;
            hintEl.style.display = long ? "" : "none";
            hintEl.textContent = long ? "会社・学校のネットでは、制限でつながらないことがあります。別の Wi-Fi やスマホの回線もためしてください。" : "";
            banner.style.display = "";
        }else banner.style.display = "none";
    }

    function toast(t){
        try{ if(typeof showToast === "function"){ showToast(t); return; } }catch(_e){}
    }

    function ok(){
        fails = 0; firstFailAt = 0;
        if(down){
            down = false; clearTimeout(probeT); probeT = 0; paint();
            toast("つながりました。最新の内容を読みこみます。");
            setTimeout(refreshNow, 300);
        }
    }
    function refreshNow(){
        try{ if(typeof pollRoom === "function") pollRoom(); }catch(_e){}
        try{ if(typeof state !== "undefined" && state && state.currentRoom && typeof loadMessages === "function") loadMessages(false); }catch(_e){}
    }
    function fail(u){
        if(!firstFailAt) firstFailAt = Date.now();
        fails++;
        try{ var o = new URL(u, location.href); probeUrl = o.origin + "/auth/v1/health"; }catch(_e){}
        if(fails >= 2 && !down){ down = true; paint(); schedule(); }
        else if(down) paint();
    }
    function schedule(){ clearTimeout(probeT); probeT = setTimeout(function(){ probe(false); }, 4000); }
    function probe(now){
        if(!probeUrl || probing){ if(down) schedule(); return; }
        probing = true;
        var c = new AbortController(), t = setTimeout(function(){ try{ c.abort(); }catch(_e){} }, 8000);
        of.call(window, probeUrl, {method: "GET", mode: "no-cors", cache: "no-store", signal: c.signal}).then(function(){ clearTimeout(t); probing = false; ok(); }, function(){
            clearTimeout(t); probing = false; if(down){ paint(); schedule(); }
        });
        if(now && msgEl) msgEl.textContent = "📡 つなぎ直しています…";
    }

    window.fetch = function(input, init){
        var u = urlOf(input);
        if(!isSupa(u)) return of.apply(this, arguments);
        var args = arguments, self = this, ctl = null, timer = 0, p;
        // 返事が こないまま 止まったときの あきらめ（/rest・/auth だけ。ほかは もともと 時間が かかることがある）
        try{
            var hasSignal = !!(init && init.signal) || (typeof Request !== "undefined" && input instanceof Request);
            if(shortApi(u) && !hasSignal && typeof AbortController !== "undefined"){
                ctl = new AbortController(); timer = setTimeout(function(){ try{ ctl.abort(); }catch(_e){} }, TIMEOUT_MS);
                var init2 = Object.assign({}, init || {}, {signal: ctl.signal});
                args = [input, init2];
            }
        }catch(_e){ args = arguments; }
        p = of.apply(self, args);
        p.then(function(r){ clearTimeout(timer); if(r && (r.status === 502 || r.status === 503 || r.status === 504 || r.status === 407)) fail(u); else ok(); },
               function(err){ clearTimeout(timer); if(err && err.name === "AbortError" && !ctl) return; fail(u); });
        return p;
    };

    window.addEventListener("online", function(){ if(down) probe(true); });
    document.addEventListener("visibilitychange", function(){ if(!document.hidden && down) probe(false); });
    window.__areNetWatchState = function(){ return {down: down, fails: fails, probeUrl: probeUrl}; };
})();
