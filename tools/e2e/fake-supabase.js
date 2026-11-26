// テスト専用：Supabase の代わりになる「サーバーもどき」。本物のサーバーには一切つながない。
// window.__fx に置いたデータを返し、呼ばれた rpc は window.__calls に記録する。
(function () {
  "use strict";
  const fx = (window.__fx = window.__fx || { tables: {}, rpc: {}, user: { id: "u-me", email: "me@example.invalid" } });
  window.__calls = window.__calls || [];
  window.__fakeErrors = window.__fakeErrors || [];

  function applyFilters(rows, filters) {
    let out = rows.slice();
    for (const f of filters) {
      if (f.op === "eq") out = out.filter((r) => r[f.col] === f.val);
      else if (f.op === "neq") out = out.filter((r) => r[f.col] !== f.val);
      else if (f.op === "in") out = out.filter((r) => f.val.includes(r[f.col]));
      else if (f.op === "ilike") {
        const needle = String(f.val).replace(/^%|%$/g, "").replace(/\\([\\%_])/g, "$1").toLowerCase();
        out = out.filter((r) => String(r[f.col] || "").toLowerCase().includes(needle));
      } else if (f.op === "like") {
        const re = new RegExp("^" + String(f.val).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$");
        out = out.filter((r) => re.test(String(r[f.col] == null ? "" : r[f.col])));
      } else if (f.op === "is") out = out.filter((r) => (f.val === null ? r[f.col] == null : r[f.col] === f.val));
    }
    return out;
  }

  function builder(table) {
    const st = { table, filters: [], limit: null, single: null, head: false, order: null };
    const api = {};
    ["select", "insert", "update", "delete", "upsert", "order", "range", "not", "or", "gt", "gte", "lt", "lte", "contains", "like", "match", "filter", "textSearch", "csv", "throwOnError", "returns", "abortSignal"].forEach((m) => {
      api[m] = function (...a) {
        if (m === "select" && a[1] && a[1].head) st.head = true;
        return api;
      };
    });
    ["insert", "update", "delete", "upsert"].forEach((m) => { const orig = api[m]; api[m] = function (...a) { window.__calls.push({ from: table, op: m, args: a[0] }); st.op = m; st.args = a[0]; st.opts = a[1]; return orig.apply(this, a); }; });
    ["eq", "neq", "in", "ilike", "like", "is"].forEach((op) => {
      api[op] = function (col, val) { st.filters.push({ op, col, val }); return api; };
    });
    api.limit = function (n) { st.limit = n; return api; };
    api.single = function () { st.single = "single"; return api; };
    api.maybeSingle = function () { st.single = "maybe"; return api; };
    api.then = function (res, rej) {
      if (fx.persist && (st.op === "upsert" || st.op === "delete")) {
        const tb = (fx.tables[table] = fx.tables[table] || []);
        if (st.op === "upsert") {
          const keys = String((st.opts && st.opts.onConflict) || "id").split(",");
          (Array.isArray(st.args) ? st.args : [st.args]).forEach((row) => { const i = tb.findIndex((r) => keys.every((k) => r[k] === row[k])); if (i >= 0) tb[i] = Object.assign({}, tb[i], row); else tb.push(Object.assign({}, row)); });
        } else { const del = applyFilters(tb, st.filters); fx.tables[table] = tb.filter((r) => !del.includes(r)); }
        return Promise.resolve({ data: null, error: null }).then(res, rej);
      }
      let rows = applyFilters((fx.tables[table] || []), st.filters);
      if (st.limit != null) rows = rows.slice(0, st.limit);
      let result;
      if (st.head) result = { data: null, error: null, count: rows.length };
      else if (st.single) result = { data: rows[0] || null, error: null };
      else result = { data: rows, error: null, count: rows.length };
      const d0 = fx.delayMs || 0;
      return (d0 ? new Promise((r) => setTimeout(r, d0)).then(() => result) : Promise.resolve(result)).then(res, rej);
    };
    return api;
  }

  window.__channels = window.__channels || {};
  window.__uploads = window.__uploads || [];
  window.__emit = function (name, type, payload, eventName) {
    const c = window.__channels[name]; if (!c) return 0; let n = 0;
    c.handlers.forEach((h) => {
      if (h.type !== type) return;
      if (type === "broadcast" && h.filter && h.filter.event && eventName && h.filter.event !== eventName) return;
      try { h.cb(payload); n++; } catch (e) { window.__fakeErrors.push("emit: " + e.message); }
    });
    return n;
  };
  function channel(name, opts) {
    const rec = (window.__channels[name] = { handlers: [], sent: [], opts: opts || null });
    const ch = {
      state: "joined",
      on(type, filter, cb) { rec.handlers.push({ type, filter, cb }); return ch; },
      subscribe(cb) { try { cb && cb("SUBSCRIBED"); } catch (_e) {} return ch; },
      send(msg) { rec.sent.push(msg); return Promise.resolve("ok"); },
      unsubscribe() { return Promise.resolve("ok"); },
      track() { return Promise.resolve("ok"); }
    };
    return ch;
  }

  const storageBucket = {
    upload: async (path, file, o) => { let bytes = null; try { if (file && file.size <= 200000 && file.arrayBuffer) bytes = Array.from(new Uint8Array(await file.arrayBuffer())); } catch (_e) {} window.__uploads.push({ path, type: file && file.type, size: file && file.size, o, bytes }); return { data: { path }, error: null }; },
    createSignedUrl: async () => ({ data: { signedUrl: "data:," }, error: null }),
    createSignedUrls: async () => ({ data: [], error: null }),
    download: async () => ({ data: new Blob([""]), error: null }),
    remove: async () => ({ data: [], error: null }),
    copy: async () => ({ data: {}, error: null }),
    getPublicUrl: () => ({ data: { publicUrl: "data:," } }),
    list: async () => ({ data: [], error: null })
  };

  const session = () => ({ access_token: "fake", user: fx.user, expires_at: 9999999999 });
  const cur = () => ((fx.noSession && !(function(){ try{ return sessionStorage.getItem('fakeSession'); }catch(e){ return null; } })()) ? null : session());

  window.areSupabase = {
    from: builder,
    rpc: async function (name, args) {
      window.__calls.push({ rpc: name, args: args });
      if (fx.delayMs && name !== 'noop') await new Promise((r) => setTimeout(r, fx.delayMs));
      const h = fx.rpc[name];
      if (typeof h === "function") {
        try { const d = await h(args); return { data: d === undefined ? null : d, error: null }; }
        catch (e) { return { data: null, error: { message: String(e && e.message || e), code: "P0001" } }; }
      }
      if (typeof fx.rpcDefault === 'function') return { data: fx.rpcDefault(name), error: null };
      return { data: null, error: null };
    },
    auth: {
      getSession: async () => ({ data: { session: cur() }, error: null }),
      setSession: async () => { fx.noSession = false; try{ sessionStorage.setItem('fakeSession','1'); }catch(e){} return { data: { session: session(), user: fx.user }, error: null }; },
      getUser: async () => ({ data: { user: cur() ? fx.user : null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({ data: { session: session(), user: fx.user }, error: null }),
      refreshSession: async () => ({ data: { session: session() }, error: null }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: (fx.aal || "aal1"), nextLevel: "aal1" }, error: null }), listFactors: async () => ({ data: { totp: (fx.totp || []), all: (fx.totp || []) }, error: null }), challenge: async (o) => { window.__calls.push({ mfa: 'challenge', o }); return { data: { id: 'ch1' }, error: null }; }, verify: async (o) => { window.__calls.push({ mfa: 'verify', o }); fx.aal = 'aal2'; return { data: {}, error: null }; } }
    },
    channel: channel,
    removeChannel: () => Promise.resolve("ok"),
    storage: { from: () => storageBucket },
    functions: { invoke: async (name, o) => { window.__calls.push({ fn: name, body: o && o.body }); return { data: {}, error: null }; } },
    realtime: { setAuth() {} }
  };

  window.addEventListener("error", (e) => window.__fakeErrors.push("error: " + e.message + " @" + (e.filename || "").split("/").pop() + ":" + e.lineno));
  window.addEventListener("unhandledrejection", (e) => window.__fakeErrors.push("rejection: " + (e.reason && e.reason.message || e.reason)));
})();
