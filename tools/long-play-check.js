#!/usr/bin/env node
"use strict";
// 長時間プレイ見張り用：本物の対戦エンジン（chat-vs.js / chat-vs2.js）で、ゲームが「まだ続いているか」「だれの番か」を計算する。
// 使い方：  echo '{"messages":[{"sender_id":"…","content":"{\"type\":\"game\",…}","created_at":"…"}, …]}' | node tools/long-play-check.js
// 入力：ゲームのメッセージ（古い順）。出力：gid ごとに {game, over, turn_user}（turn_user は「次の番」の人の user id。決まっていなければ null）
const fs = require("fs"), vm = require("vm"), path = require("path");
const root = path.resolve(__dirname, "..");
const input = JSON.parse(fs.readFileSync(0, "utf8"));
const sandbox = {console, state: {messages: [], user: {id: ""}}, feat: {}};
vm.createContext(sandbox);
// 対戦エンジンは、chat-vs.js → chat-vs2.js の順に読む（chat-base.js の parseMessageContent だけ 必要）
const base = fs.readFileSync(path.join(root, "chat-base.js"), "utf8");
const m = /function parseMessageContent\(content\)\{[\s\S]*?\r?\n\}\r?\n/.exec(base);
if(!m){ console.error("parseMessageContent が見つかりません"); process.exit(2); }
const code = m[0] + "\n" + ["chat-vs.js", "chat-vs2.js"].map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n") +
    "\n;globalThis.__vs = {vsCompute, VS_ENGINES};";
vm.runInContext(code, sandbox, {filename: "vs-engines.js"});
const {vsCompute, VS_ENGINES} = sandbox.__vs;
const byGid = {};
(input.messages || []).forEach((x) => { let p = null; try{ p = JSON.parse(x.content); }catch(_e){} if(p && p.type === "game" && p.gid) (byGid[p.gid] = byGid[p.gid] || []).push(x); });
const out = {};
Object.keys(byGid).forEach((gid) => {
    sandbox.state.messages = byGid[gid];
    try{
        const S = vsCompute(gid);
        if(!S){ out[gid] = {unknown: true}; return; }
        const t = S.players[S.turn];
        out[gid] = {game: S.game, over: !!S.over, turn_user: (typeof t === "string" ? t : null), players: S.players.filter((p) => typeof p === "string")};
    }catch(e){ out[gid] = {error: String(e.message || e)}; }
});
console.log(JSON.stringify(out));
