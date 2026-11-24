// 画面に出ている文字から、「まだ訳されていない日本語」を洗い出す（Playwright）
//   node tools/i18n-scan.js --lang en [--harvest out.json] [--chat] [--pages] [--only calc,timer]
//   ・--harvest：その言語（ふつうは ja）で 画面に出た文を ぜんぶ 集めて JSON に書く（辞書の 材料）
//   ・--lang en/zh/ko：その言語で 開いて、日本語のまま 残っている 文を 画面ごとに 一覧にする
//   ・--chat：お試し（ゲスト）でログインして、チャットの 各タブ・ツールを ひらく。--pages：ログイン前の ページ
// ※ 管理者の 画面は 対象外（日本語のまま）。
const { chromium } = require("playwright");
const fs = require("fs");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true); };
const LANG = opt("lang", "ja"), BASE = opt("base", "http://localhost:8099"), HARVEST = opt("harvest", ""), ONLY = (opt("only", "") || "").split(",").filter(Boolean);
const DOCHAT = !!opt("chat", false), DOPAGES = !!opt("pages", false), JA_REF = opt("ref", "");
const KANA = /[\u3040-\u30fa\u30fc-\u30ff\uff66-\uff9f]/, CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9f]/;
const PAGES = ["index.html", "login.html", "register.html", "recovery.html", "404.html", "virus.html", "guide.html", "faq.html", "help.html", "terms.html", "privacy.html", "credits.html", "changelog.html", "achievements.html", "Quiz.html"];
const found = {};   // 画面名 → Set(文)
const add = (screen, arr) => { const s = found[screen] || (found[screen] = new Set()); arr.forEach((t) => s.add(t)); };

async function collect(page){
  return page.evaluate(() => {
    const out = [], re = /[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ]/;
    const skip = (e) => e && e.closest && e.closest("script,style,noscript,textarea,code,pre,[data-i18n-skip],.i18n-skip");
    const w = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
    let n; while((n = w.nextNode())){ const t = n.nodeValue.replace(/\s+/g, " ").trim(); if(t && re.test(t) && !skip(n.parentElement)) out.push(t); }
    document.querySelectorAll("[placeholder],[title],[aria-label],[alt]").forEach((e) => { if(skip(e)) return; ["placeholder", "title", "aria-label", "alt"].forEach((a) => { const t = (e.getAttribute(a) || "").replace(/\s+/g, " ").trim(); if(t && re.test(t)) out.push(t); }); });
    return out;
  });
}
// ja の 辞書（--ref）にある文と 同じ（または かなを 含む）なら 「訳されていない」。 zh は 漢字だけの文が 区別できないので この方法を使う
let REF = null; if(JA_REF){ try{ REF = new Set(JSON.parse(fs.readFileSync(JA_REF, "utf8")).all); }catch(_e){} }
function leftover(arr){
  if(LANG === "ja") return arr;
  return arr.filter((t) => {
    if(KANA.test(t)) return true;
    if(LANG === "zh") return REF ? REF.has(t) : false;
    return CJK.test(t) && !/[가-힯]/.test(t) || (REF && REF.has(t));   // en / ko：漢字が 残っていれば（ko は ハングルが ない 文だけ）
  });
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 900 } });
  await ctx.addInitScript((l) => { try{ localStorage.setItem("are_lang", l); localStorage.setItem("are_first_tips_done", "1"); }catch(e){} }, LANG);
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
  if(DOPAGES){
    for(const p of PAGES){
      if(ONLY.length && !ONLY.includes(p)) continue;
      try{ await page.goto(BASE + "/" + p, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1200); add("page:" + p, await collect(page)); }catch(e){ console.log("page fail", p, String(e).slice(0, 80)); }
    }
  }
  if(DOCHAT){
    await page.goto(BASE + "/login.html"); await page.waitForTimeout(500);
    await page.click("#startGuest"); await page.waitForTimeout(800); await page.click("#guestNoticeYes");
    await page.waitForURL("**/chat.html**", { timeout: 40000 }); await page.waitForTimeout(2500);
    for(let i = 0; i < 6; i++){   // お知らせ・はじめてのヒントを閉じる
      const ok = await page.$('[data-t="an:ok"],#ftipOk'); if(!ok) break; try{ await ok.click({ timeout: 1500 }); }catch(_e){} await page.waitForTimeout(300);
    }
    add("chat:main", await collect(page));
    // タブ
    for(const sel of ["#rail button", ".rail button", "nav button"]){
      const n = await page.$$eval(sel, (a) => a.length).catch(() => 0);
      if(n){ for(let i = 0; i < n; i++){ try{ await page.$$eval(sel, (a, i) => a[i].click(), i); await page.waitForTimeout(400); add("chat:tab" + i, await collect(page)); }catch(_e){} } break; }
    }
    const tools = await page.evaluate(() => (typeof TOOL_LIST !== "undefined" ? TOOL_LIST : []).map((t) => [t[0], t[4]]));
    for(const [ns, fn] of tools){
      if(ONLY.length && !ONLY.includes(ns)) continue;
      if(["security", "storage", "push"].includes(ns) && false) continue;
      try{
        await page.evaluate((fn) => { try{ if(typeof closeSheet === "function") closeSheet(); }catch(e){} const f = window[fn]; if(typeof f === "function") { const r = f(); if(r && r.catch) r.catch(() => {}); } }, fn);
        await page.waitForTimeout(700);
        add("tool:" + ns, await collect(page));
        await page.evaluate(() => { try{ if(typeof closeSheet === "function") closeSheet(); }catch(e){} });
      }catch(e){ console.log("tool fail", ns, String(e).slice(0, 80)); }
    }
    // ゲストは 後始末（ログアウト→アカウント削除）
    try{ await page.evaluate(() => { try{ if(typeof logout === "function") logout({silent:true}); }catch(e){} }); }catch(_e){}
  }
  await b.close();
  const all = new Set(); let total = 0, left = 0; const report = {};
  for(const [k, set] of Object.entries(found)){ const arr = [...set]; arr.forEach((t) => all.add(t)); const lo = leftover(arr); total += arr.length; left += lo.length; report[k] = { total: arr.length, left: lo }; }
  if(HARVEST){ fs.writeFileSync(HARVEST, JSON.stringify({ lang: LANG, all: [...all].sort(), screens: Object.fromEntries(Object.entries(found).map(([k, v]) => [k, [...v]])) }, null, 1)); console.log("harvested", all.size, "->", HARVEST); }
  if(LANG !== "ja"){
    console.log("画面ごとの 訳されていない文（" + LANG + "）：全 " + total + " 文のうち " + left + " 文");
    for(const [k, r] of Object.entries(report)) console.log(String(r.left.length).padStart(4) + "/" + String(r.total).padStart(4), k);
    if(opt("list", false)) for(const [k, r] of Object.entries(report)) if(r.left.length){ console.log("## " + k); r.left.forEach((t) => console.log("  " + t.slice(0, 120))); }
    fs.writeFileSync(opt("out", "/tmp/i18n-left-" + LANG + ".json"), JSON.stringify(Object.fromEntries(Object.entries(report).map(([k, r]) => [k, r.left])), null, 1));
  }
  if(errs.length) console.log("ページのエラー:", [...new Set(errs)].slice(0, 6));
})();
