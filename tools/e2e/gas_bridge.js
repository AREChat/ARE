"use strict";
// ブラウザの試験用：本物の GAS コード（gas/AIbot-Code.gs と gas/hub-extra.gs）を、Node で動かして HTTP で受けつける。
//   node tools/e2e/gas_bridge.js 8799      → POST / に JSON を送ると、doPost の答えを返す（ログイン確認は "tok-<ユーザー>…" を受け入れる疑似）
const http = require("http"), path = require("path");
const { makeGas } = require(path.join(__dirname, "..", "gas-hub-test.js"));
const g = makeGas({});
g.advance(Date.now() - Date.UTC(2026, 10, 26, 3, 0, 0));      // 疑似の時計を 今に合わせる（時刻のおかしい値を断る点検のため）
g.responders.fetch = (url, o) => {
  if (/\/auth\/v1\/user$/.test(url)) {
    const m = /^Bearer tok-(u[0-9a-z]+)/.exec(String(o.headers.Authorization));
    return m ? { getResponseCode: () => 200, getContentText: () => JSON.stringify({ id: m[1] }) } : { getResponseCode: () => 401, getContentText: () => "{}" };
  }
  return null;
};
http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => { b += c; });
  req.on("end", () => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "GET") { res.end(JSON.stringify(g.get({ action: "hub" }))); return; }
    g.advance(1500);      // 1回ごとに 少し進める（1分40回の上限に 試験が ぶつからないように）
    let out; try { out = g.post(b); } catch (e) { out = { ok: false, message: "bridge:" + e.message }; }
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(out));
  });
}).listen(Number(process.argv[2] || 8799), "127.0.0.1", () => console.log("ready"));
