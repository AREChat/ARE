"use strict";
// 利用時間レポートの GAS 側（gas/file-storage.gs の action=usage）を、本物のコードのまま Node で動かして調べる。
//   node tools/usage-gas-test.js
const { loadGas } = require("./gas-harness");
let ok = 0, ng = 0;
const check = (cond, msg) => { if (cond) ok++; else { ng++; console.log("NG:", msg); } };
const eq = (a, b, msg) => check(JSON.stringify(a) === JSON.stringify(b), msg + "  期待=" + JSON.stringify(b) + " 実際=" + JSON.stringify(a));
const U = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const DAY = 24 * 3600 * 1000;
const ID = (n, name, seg, extra) => Object.assign({ uid: U(n), name, seg, admin: false, guest: false }, extra || {});

function world(extra) {
  const h = loadGas(Object.assign({
    identities: {
      "tok-adm-aaaaaaaaaaaaaaaaaaaa": ID(1, "管理者の本名", "other", { admin: true }),
      "tok-home1-aaaaaaaaaaaaaaaaaa": ID(2, "家庭ママ", "home"),
      "tok-work1-aaaaaaaaaaaaaaaaaa": ID(3, "社員ヤマダ", "work"),
      "tok-work2-aaaaaaaaaaaaaaaaaa": ID(4, "社員サトウ", "work"),
      "tok-frnd1-aaaaaaaaaaaaaaaaaa": ID(5, "友人タカハシ", "friend"),
      "tok-frnd2-aaaaaaaaaaaaaaaaaa": ID(6, "友人イトウ", "friend"),
      "tok-othr1-aaaaaaaaaaaaaaaaaa": ID(7, "他人ナカムラ", "other"),
      "tok-othr2-aaaaaaaaaaaaaaaaaa": ID(8, "他人コバヤシ", "other"),
      "tok-gest1-aaaaaaaaaaaaaaaaaa": ID(9, "お試しゲスト", "other", { guest: true }),
    },
  }, extra || {}));
  return h;
}
const T = { adm: "tok-adm-aaaaaaaaaaaaaaaaaaaa", home1: "tok-home1-aaaaaaaaaaaaaaaaaa", work1: "tok-work1-aaaaaaaaaaaaaaaaaa", work2: "tok-work2-aaaaaaaaaaaaaaaaaa",
  frnd1: "tok-frnd1-aaaaaaaaaaaaaaaaaa", frnd2: "tok-frnd2-aaaaaaaaaaaaaaaaaa", othr1: "tok-othr1-aaaaaaaaaaaaaaaaaa", othr2: "tok-othr2-aaaaaaaaaaaaaaaaaa", gest1: "tok-gest1-aaaaaaaaaaaaaaaaaa" };
const today = (h) => h.run("usageDay_(Date.now())");
const add = (h, tok, secs, day) => { const d = {}; d[day || today(h)] = secs; return h.post({ action: "usage", op: "add", token: tok, days: d }); };
const rank = (h, tok) => h.post({ action: "usage", op: "rank", token: tok });

// 1) 本人の確認 --------------------------------------------------------------
{
  const h = world();
  let r = h.post({ action: "usage", op: "add", token: "nobody-nobody-nobody-nobody", days: {} });
  check(r.ok === false && /ログイン/.test(r.message), "知らないトークンは断る: " + JSON.stringify(r));
  r = h.post({ action: "usage", op: "rank" });
  check(r.ok === false && /ログイン/.test(r.message), "トークンなしは断る");
  r = h.post({ action: "usage", op: "rank", token: "short" });
  check(r.ok === false, "短すぎるトークンは断る（Supabase に聞かない）");
  check(h.stats.fetch.length === 1, "短いトークン・空は Supabase に聞かない（聞いたのは1回だけ）: " + h.stats.fetch.length);
  r = h.post({ action: "usage", op: "rank", token: "x".repeat(4001) });
  check(r.ok === false && h.stats.fetch.length === 1, "長すぎるトークンも聞かずに断る");
  r = h.post({ action: "usage", op: "bogus", token: T.work1 });
  check(r.ok === false && /不明/.test(r.message), "知らない操作");
  r = h.post({ action: "usage", token: T.work1 });
  check(r.ok === false && /不明/.test(r.message), "op なし");

  const h2 = world({ rpcMissing: true });
  r = h2.post({ action: "usage", op: "rank", token: T.work1 });
  check(r.ok === false && /report_identity_v1/.test(r.message), "サーバー側の関数がまだのときは、そう伝える: " + JSON.stringify(r));

  const h3 = world();
  h3.idents["tok-bad-aaaaaaaaaaaaaaaaaaaaaa"] = { __raw: "これはJSONではない" };
  h3.idents["tok-bad2-aaaaaaaaaaaaaaaaaaaaa"] = { uid: "not-a-uuid", name: "x", seg: "work", admin: false };
  r = h3.post({ action: "usage", op: "rank", token: "tok-bad-aaaaaaaaaaaaaaaaaaaaaa" });
  check(r.ok === false, "壊れた返事は断る");
  r = h3.post({ action: "usage", op: "rank", token: "tok-bad2-aaaaaaaaaaaaaaaaaaaaa" });
  check(r.ok === false, "ユーザー番号が UUID でなければ断る");
  // 区分が知らない値 → other として扱う（いちばん厳しい）。名前の制御文字・長さ
  h3.idents["tok-weird-aaaaaaaaaaaaaaaaaaaa"] = { uid: U(50), name: "  \u0007\u0000a".padEnd(60, "あ") + "\n", seg: "hacker", admin: "yes", guest: 1 };
  r = add(h3, "tok-weird-aaaaaaaaaaaaaaaaaaaa", 100);
  check(r.ok === true && r.recorded === true, "admin:'yes'・guest:1 は true とみなさない（=== true のときだけ）: " + JSON.stringify(r));
  const p = h3.prop(U(50));
  check(p && p.g === "other", "知らない区分は other");
  check(p && p.n.length === 30 && !/[\u0000-\u001f]/.test(p.n), "名前は制御文字を除き30文字まで: " + JSON.stringify(p && p.n));
}

// 2) 管理者は記録しない・見るだけ ---------------------------------------------
{
  const h = world();
  let r = add(h, T.adm, 300);
  eq(r, { ok: true, recorded: false, admin: true }, "管理者の記録は受けつけない");
  check(h.prop(U(1)) === null, "管理者の記録は保存されない");
  // あとから管理者になった人の古い記録は、管理者が使った時点で消える
  h.props.set("usage:" + U(1), JSON.stringify({ t: 999, d: {}, g: "work", n: "旧", l: 1 }));
  r = rank(h, T.adm);
  check(r.ok === true && r.admin === true, "管理者はランキングを見られる");
  check(h.prop(U(1)) === null, "管理者になった人の古い記録は消える");
  check(r.rows.length === 0, "管理者の分は出ない");
}

// 3) 家庭・お試し：記録もしない・見せない ---------------------------------------
{
  const h = world();
  let r = add(h, T.home1, 300);
  eq(r, { ok: true, recorded: false, hidden: true, reason: "home" }, "家庭は記録しない");
  check(h.prop(U(2)) === null, "家庭の記録は保存されない");
  r = rank(h, T.home1);
  eq(r, { ok: true, recorded: false, hidden: true, reason: "home" }, "家庭にはランキングを返さない");
  r = add(h, T.gest1, 300);
  eq(r, { ok: true, recorded: false, hidden: true, reason: "guest" }, "お試し（ゲスト）は記録しない");
  check(h.prop(U(9)) === null, "ゲストの記録は保存されない");
  r = rank(h, T.gest1);
  check(r.hidden === true && !r.rows, "ゲストにはランキングを返さない");
  // 区分が あとから「家庭」に変わった人：古い記録は消え、ランキングにも出ない
  const w = add(h, T.work1, 100);
  check(w.recorded === true, "社員は記録される");
  h.idents[T.work1].seg = "home"; h.cacheMap.clear();
  r = add(h, T.work1, 100);
  check(r.hidden === true && h.prop(U(3)) === null, "家庭に変わった人の古い記録は消える");
  h.props.set("usage:" + U(60), JSON.stringify({ t: 500, d: {}, g: "home", n: "家庭の古い記録", l: 1 }));
  r = rank(h, T.work2);
  check(!JSON.stringify(r).includes("家庭の古い記録") && r.rows.every((x) => x.t !== 500), "ランキングに 家庭の記録は 出ない");
}

// 4) 記録の足し方・ごまかし対策 -------------------------------------------------
{
  const h = world();
  let r = add(h, T.work1, 300);
  check(r.ok && r.recorded && r.added === 300 && r.today === 300, "はじめて：300秒: " + JSON.stringify(r));
  r = add(h, T.work1, 300);
  check(r.added === 90, "すぐ次を送っても、経った時間＋90秒しか足さない: " + r.added);
  h.advance(300 * 1000);
  r = add(h, T.work1, 300);
  check(r.added === 300, "5分あけたら 300秒: " + r.added);
  h.advance(10 * 1000);
  r = add(h, T.work1, 1000);
  check(r.added === 100, "10秒後に1000秒送っても 10+90=100秒: " + r.added);
  let p = h.prop(U(3));
  check(p.t === 300 + 90 + 300 + 100 && p.d[today(h)] === p.t, "累計と日別: " + JSON.stringify(p));
  check(p.n === "社員ヤマダ" && p.g === "work", "名前と区分も保存");

  // 初回は 900 まで
  const h2 = world();
  r = add(h2, T.work2, 1800);
  check(r.added === 900, "はじめては 15分まで: " + r.added);
  // 1回 30分まで
  h2.advance(10 * 3600 * 1000);
  r = add(h2, T.work2, 99999);
  check(r.added === 1800, "1回の上限 30分: " + r.added);
  // 日付：きょう・きのう以外は受けつけない
  h2.advance(10 * 3600 * 1000);
  const d = {}; d["2020-01-01"] = 600; d[h2.run("usageDay_(Date.now() - 86400000)")] = 100; d["2999-01-01"] = 600; d["abc"] = 5; d["__proto__"] = 9;
  r = h2.post({ action: "usage", op: "add", token: T.work2, days: d });
  check(r.ok && r.added === 100, "古い日付・未来・変な日付は無視（きのうの分だけ）: " + JSON.stringify(r));
  p = h2.prop(U(4));
  check(!p.d["2020-01-01"] && !p.d["2999-01-01"] && !p.d.abc, "変な日付が保存されていない");
  // 変な値
  for (const bad of [-5, 0, NaN, Infinity, "abc", null, undefined, [], {}, true, "12abc"]) {
    const hh = world(); const dd = {}; dd[today(hh)] = bad;
    const rr = hh.post({ action: "usage", op: "add", token: T.work1, days: dd });
    check(rr.ok && !rr.added && !hh.prop(U(3)), "不正な秒数 " + JSON.stringify(bad) + " は足さない: " + JSON.stringify(rr));
  }
  r = h2.post({ action: "usage", op: "add", token: T.work2, days: "x" });
  check(r.ok && !r.added, "days が文字列でも落ちない");
  r = h2.post({ action: "usage", op: "add", token: T.work2 });
  check(r.ok && !r.added, "days なしでも落ちない");
  r = h2.post({ action: "usage", op: "add", token: T.work2, days: [1, 2, 3] });
  check(r.ok && !r.added, "days が配列でも落ちない");
  // 小数は切りすて
  const h4 = world(); r = add(h4, T.work1, 12.9); check(r.added === 12, "小数は切りすて: " + r.added);
  // 1日 24時間まで
  const h5 = world();
  let total = 0;
  for (let i = 0; i < 60; i++) { r = add(h5, T.work1, 1800); total += r.added || 0; h5.advance(1800 * 1000); }
  const day = today(h5);
  const p5 = h5.prop(U(3));
  check(Object.values(p5.d).every((v) => v <= 86400), "1日の上限 86400 秒: " + JSON.stringify(p5.d));
  // 日をまたぐ：きのうときょうの両方
  const h6 = world(); add(h6, T.work1, 300); h6.advance(3600 * 1000);
  const dd = {}; dd[h6.run("usageDay_(Date.now() - 86400000)")] = 50; dd[today(h6)] = 60;
  r = h6.post({ action: "usage", op: "add", token: T.work1, days: dd });
  check(r.added === 110, "きのうときょうを同時に足せる: " + JSON.stringify(r));
}

// 5) 古い日の整理（35日）----------------------------------------------------
{
  const h = world();
  add(h, T.work1, 300);
  for (let i = 1; i <= 40; i++) { h.advance(DAY); add(h, T.work1, 60); }
  const p = h.prop(U(3));
  const keys = Object.keys(p.d);
  check(keys.length === 35, "日別は直近35日だけ残る: " + keys.length);
  check(p.t === 300 + 40 * 60, "累計は消えない: " + p.t);
  check(JSON.stringify(p).length < 2000, "1人分は小さいまま: " + JSON.stringify(p).length);
}

// 6) ランキング：本名と匿名の出し分け ------------------------------------------
{
  const h = world();
  add(h, T.work1, 900); add(h, T.work2, 600); add(h, T.frnd1, 500); add(h, T.frnd2, 400); add(h, T.othr1, 300); add(h, T.othr2, 200);
  const names = ["社員ヤマダ", "社員サトウ", "友人タカハシ", "友人イトウ", "他人ナカムラ", "他人コバヤシ", "家庭ママ", "管理者の本名", "お試しゲスト"];
  const seen = (r) => r.rows.filter((x) => x.nm).map((x) => x.nm).sort();
  // 社員ヤマダ：社員の2人（自分・サトウ）は本名、友人と その他は匿名
  let r = rank(h, T.work1);
  eq(seen(r), ["社員サトウ", "社員ヤマダ"], "社員から見る：同じ社員だけ本名");
  check(r.rows.length === 6 && r.total === 6, "全員（6人）が並ぶ: " + r.rows.length);
  let js = JSON.stringify(r);
  for (const n of ["友人タカハシ", "友人イトウ", "他人ナカムラ", "他人コバヤシ", "家庭ママ", "管理者の本名", "お試しゲスト"]) check(!js.includes(n), "社員への返事に『" + n + "』が混ざらない");
  check(r.rows.filter((x) => x.me).length === 1 && r.rows.find((x) => x.me).nm === "社員ヤマダ", "自分の行に me");
  check(r.rows.every((x) => !("sg" in x)), "区分は管理者にしか返さない");
  check(r.rows.every((x) => !("uid" in x) && !("g" in x) && !("n" in x)), "ユーザー番号・内部の項目は返さない");
  // 友人タカハシ
  r = rank(h, T.frnd1);
  eq(seen(r), ["友人イトウ", "友人タカハシ"], "友人から見る：同じ友人だけ本名");
  js = JSON.stringify(r); check(!js.includes("社員ヤマダ") && !js.includes("社員サトウ") && !js.includes("他人"), "友人への返事に社員・その他の名前が混ざらない");
  // その他：同じその他どうしでも匿名（隔離のため）。自分の行だけ本名
  r = rank(h, T.othr1);
  eq(seen(r), ["他人ナカムラ"], "その他から見る：自分以外はぜんぶ匿名（同じその他でも）");
  js = JSON.stringify(r); check(!js.includes("他人コバヤシ") && !js.includes("社員") && !js.includes("友人"), "その他への返事に他の人の名前が混ざらない");
  // 管理者：ぜんぶ本名＋区分
  r = rank(h, T.adm);
  eq(seen(r), ["他人コバヤシ", "他人ナカムラ", "友人イトウ", "友人タカハシ", "社員サトウ", "社員ヤマダ"], "管理者は ぜんぶ本名");
  check(r.rows.every((x) => ["work", "friend", "other"].includes(x.sg)), "管理者には区分も返る");
  check(r.rows.every((x) => !x.me), "管理者に me は付かない");
  check(r.mine7 === undefined, "管理者に自分の7日分はない");
  // 匿名の番号：みんなに同じ・5文字・名前と無関係・ユーザー番号を含まない
  const a1 = rank(h, T.work1).rows, a2 = rank(h, T.frnd1).rows;
  const byT = (rows, t) => rows.find((x) => x.t === t).an;
  check(byT(a1, 500) === byT(a2, 500) && /^[0-9A-F]{5}$/.test(byT(a1, 500)), "匿名の番号は 見る人が変わっても同じ・16進5文字: " + byT(a1, 500));
  check(new Set(a1.map((x) => x.an)).size === a1.length, "番号が重ならない");
  check(!JSON.stringify(a1).includes("0000-4000"), "ユーザー番号が返事に入らない");
  const salt = h.props.get("USAGE_SALT"); check(salt && salt.length > 40, "ひみつの塩ができる");
  const h2 = world({ props: { USAGE_SALT: "another-salt-another-salt-another-salt-xx" } });
  add(h2, T.work1, 900);
  const b = rank(h2, T.work1).rows[0].an;
  check(b !== a1.find((x) => x.t === 900).an, "塩がちがえば番号もちがう（番号から ユーザーは割り出せない）");
  // 期間
  check(r.rows.find((x) => x.t === 900).d === 900 && r.rows.find((x) => x.t === 900).w === 900 && r.rows.find((x) => x.t === 900).m === 900, "今日・7日・30日");
  // 名前に HTML や長い名前
  const hx = world();
  hx.idents["tok-xss-aaaaaaaaaaaaaaaaaaaaaa"] = ID(70, "<img src=x onerror=alert(1)>", "work");
  add(hx, "tok-xss-aaaaaaaaaaaaaaaaaaaaaa", 100);
  const rx = rank(hx, T.work1);
  check(rx.rows.find((x) => x.nm && x.nm.includes("<img")), "名前は そのまま返す（画面側で エスケープする）");
}

// 7) 期間の計算（きょう・7日・30日・累計）--------------------------------------
{
  const h = world();
  add(h, T.work1, 100);                                                    // 0日前
  for (let i = 1; i <= 34; i++) { h.advance(DAY); }                        // 34日すすむ → 最初の記録は 34日前
  // 日ごとに 10 秒ずつ：いまから 34日前までを埋める
  const h2 = world();
  const start = h2.clock.now;
  for (let i = 34; i >= 0; i--) { h2.clock.now = start - i * DAY; add(h2, T.work2, 10); h2.advance(1000 * 3600 * 2); h2.clock.now = start - i * DAY + 1000; }
  h2.clock.now = start + 1000;
  const r = rank(h2, T.work2).rows[0];
  check(r.t === 350, "累計 350（35日分）: " + r.t);
  check(r.d === 10, "きょう 10: " + r.d);
  check(r.w === 70, "7日 70: " + r.w);
  check(r.m === 300, "30日 300: " + r.m);
  const rr = rank(h2, T.work2);
  check(rr.mine7.length === 7 && rr.mine7[6][0] === today(h2) && rr.mine7[6][1] === 10 && rr.mine7.every((x) => x[1] === 10), "自分の7日分（古い順）: " + JSON.stringify(rr.mine7));
  check(rr.mine7[0][0] < rr.mine7[6][0], "7日分は古い順");
}

// 8) 多い人数：300人まで＋自分の行 ----------------------------------------------
{
  const props = {};
  for (let i = 0; i < 350; i++) props["usage:" + U(1000 + i)] = JSON.stringify({ t: 1000 + i, d: {}, g: i % 2 ? "work" : "friend", n: "N" + i, l: 1 });
  const h = world({ props });
  // 自分（社員ヤマダ）は 最下位
  props["usage:" + U(3)] = JSON.stringify({ t: 5, d: {}, g: "work", n: "社員ヤマダ", l: 1 });
  h.props.set("usage:" + U(3), props["usage:" + U(3)]);
  const r = rank(h, T.work1);
  check(r.total === 351 && r.rows.length === 301, "300人＋自分の行: " + r.rows.length + "/" + r.total);
  check(r.rows[0].t === 1349 && r.rows[299].t === 1050, "累計の多い順");
  check(r.rows[300].me === true && r.rows[300].nm === "社員ヤマダ", "自分の行が最後に入る");
  check(JSON.stringify(r).length < 40000, "返事の大きさ: " + JSON.stringify(r).length);
  // 壊れた保存データは飛ばす
  h.props.set("usage:" + U(2000), "{broken");
  h.props.set("usage:" + U(2001), "123");
  h.props.set("usage:" + U(2002), JSON.stringify({ t: "abc" }));
  h.props.set("other-key", "x");
  const r2 = rank(h, T.work1);
  check(r2.ok && r2.total === 351, "壊れたデータ・ほかのキーは無視: " + r2.total);
}

// 9) 本人確認の控え（Supabase への問い合わせを増やさない）-------------------------
{
  const h = world();
  add(h, T.work1, 100); rank(h, T.work1); rank(h, T.work1); add(h, T.work1, 10);
  check(h.stats.fetch.length === 1, "同じトークンは 20分 Supabase に聞かない: " + h.stats.fetch.length);
  h.advance(21 * 60 * 1000);
  rank(h, T.work1);
  check(h.stats.fetch.length === 2, "20分たつと聞きなおす: " + h.stats.fetch.length);
  add(h, T.work2, 10);
  check(h.stats.fetch.length === 3, "別のトークンは別に聞く");
  const f = h.stats.fetch[0];
  check(/report_identity_v1$/.test(f.url) && f.o.headers.Authorization === "Bearer " + T.work1 && f.o.headers.apikey, "本人のログインで呼ぶ（apikey つき）");
  check(f.o.payload === "{}", "送るのは空の {} だけ");
  // 失敗した確認は 控えない
  const h2 = world(); h2.post({ action: "usage", op: "rank", token: "tok-nope-aaaaaaaaaaaaaaaaaaaaa" }); h2.post({ action: "usage", op: "rank", token: "tok-nope-aaaaaaaaaaaaaaaaaaaaa" });
  check(h2.stats.fetch.length === 2, "断った確認は控えない（そのたびに聞く）");
}

// 10) ロックと失敗 ----------------------------------------------------------
{
  const h = world();
  add(h, T.work1, 100);
  check(h.stats.locks === 1 && h.stats.unlocks === 1, "ロックを取って、かならず返す");
  h.stats.failSet = true;
  h.advance(400 * 1000);
  const r = add(h, T.work1, 100);
  check(r.ok === false && /いっぱい|上限/.test(r.message), "保存できないときは、そう伝える: " + JSON.stringify(r));
  check(h.stats.locks === h.stats.unlocks, "失敗してもロックは返す: " + h.stats.locks + "/" + h.stats.unlocks);
  // 巨大な保存データ
  const h2 = world();
  h2.props.set("usage:" + U(3), JSON.stringify({ t: 1, d: Object.fromEntries(Array.from({ length: 600 }, (_, i) => ["2026-01-" + i, 1])), g: "work", n: "x", l: 1 }));
  h2.advance(400 * 1000);
  const r2 = add(h2, T.work1, 100);
  check(r2.ok === false || r2.recorded, "巨大な保存データでも落ちない: " + JSON.stringify(r2));
  check(h2.stats.locks === h2.stats.unlocks, "ロックは返す");
}

// 11) ほかの機能をこわしていない -----------------------------------------------
{
  const h = world();
  check(h.get({ action: "ping" }).features.includes("usage") && /usage/.test(h.get({ action: "ping" }).version), "ping に usage が出る");
  const r = h.post({ action: "call", op: "ice", token: T.work1 });
  check(r && typeof r === "object", "通話の窓口は これまでどおり動く");
  check(h.post({ action: "nothing" }).ok === false, "知らない action は ことわる");
  check(h.post("not json at all").ok === false, "壊れた POST でも 落ちない");
  check(h.post({ action: "start" }).ok === false, "ファイル保存の start も これまでどおり（トークンなしは断る）");
}

// 12) ドライブへの控え ------------------------------------------------------
{
  const h = world();
  add(h, T.work1, 100); add(h, T.frnd1, 200);
  const n = h.run("usageBackup()");
  check(n === 2, "控えに2人: " + n);
  const f = h.driveFiles[0];
  check(f && /^利用時間レポート-\d{4}-\d{2}-\d{2}\.csv$/.test(f.name) && f.content.startsWith("﻿"), "CSV の名前と BOM: " + (f && f.name));
  check(/社員ヤマダ/.test(f.content) && /友人タカハシ/.test(f.content) && !/家庭ママ/.test(f.content), "CSV の中身（管理者用の控えなので本名）");
  h.run("usageBackup()");
  check(h.driveFiles.filter((x) => !x.trashed).length === 1, "もう一度実行しても 1つだけ（古いほうはごみ箱へ）");
  // CSV インジェクションの対策：名前が = で始まる人
  const h2 = world(); h2.idents["tok-eq-aaaaaaaaaaaaaaaaaaaaaaa"] = ID(80, '=HYPERLINK("http://x")', "work");
  add(h2, "tok-eq-aaaaaaaaaaaaaaaaaaaaaaa", 100); h2.run("usageBackup()");
  const line = h2.driveFiles[0].content.split("\r\n")[1];
  check(/^"'=HYPERLINK/.test(line), "CSV の先頭が = のままにならない（表計算での式の実行を防ぐ）: " + line);
}

console.log("usage-gas-test: OK " + ok + " / NG " + ng);
process.exit(ng ? 1 : 0);
