// 各ゲームの画面が エラーなしで 開くか 確かめる（GitHub Actions で 自動実行）
const { chromium } = require("playwright");
(async () => {
  const base = process.env.BASE || "http://localhost:8080";
  const pages = ["login.html", "achievements.html", "game/index.html", "game4/index.html", "game6/index.html", "terms.html", "privacy.html", "guide.html", "faq.html", "credits.html", "changelog.html", "404.html"];
  const b = await chromium.launch(); let bad = 0;
  for (const u of pages) {
    const p = await b.newPage(), errs = [];
    p.on("pageerror", (e) => errs.push(String(e)));
    const r = await p.goto(base + "/" + u); await p.waitForTimeout(1500);
    if (!r || r.status() >= 400 || errs.length) { bad++; console.log("NG", u, r && r.status(), errs.slice(0, 3)); } else console.log("OK", u);
    await p.close();
  }
  await b.close(); process.exit(bad ? 1 : 0);
})();
