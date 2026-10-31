// ===== Three.js の 読みこみ（どこから読めたか／なぜ失敗したかを 記録する）=====
import {DF} from "./config.js";
export const source = {used: null, revision: null, tried: []};
const want = new URLSearchParams(location.search).get("three") || "local";
async function tryImport(label, url){
    try{ const m = await import(url); source.tried.push({label, url, ok: true}); return m; }
    catch(e){ source.tried.push({label, url, ok: false, error: String((e && e.message) || e)}); return null; }
}
let mod = await tryImport("local（同梱）", new URL(DF.local, import.meta.url).href);
if(!mod && want === "cdn") mod = await tryImport("cdn（?three=cdn）", DF.cdn);
if(!mod){ const e = new Error("Three.js を 読みこめませんでした"); e.code = "THREE_LOAD"; e.tried = source.tried; throw e; }
if(!mod.REVISION || !mod.WebGLRenderer){ const e = new Error("読みこんだ ファイルは Three.js ではないようです（REVISION / WebGLRenderer が ありません）"); e.code = "THREE_BAD"; e.tried = source.tried; throw e; }
source.used = source.tried[source.tried.length - 1].label; source.revision = mod.REVISION;
export const T = mod;
