document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);
    const PAGE = 50;
    let offset = 0, names = {}, loginNote = "";   // loginNote：ログイン直後の案内（追加認証のこと）。検索のたびに消えないよう おぼえておく
    const status = (t, err) => { $("st").textContent = t; $("st").className = err ? "err" : ""; };
    const api = (payload) => window.ARESystem.callAuthenticatedFunction("admin-api", payload);

    function show(on) { $("panel").hidden = !on; $("lf").hidden = on; }

    function bodyText(content) {
        try { const o = JSON.parse(content); if (o && o.type === "text") return o.text; if (o && o.name) return "[" + o.type + "] " + o.name; } catch (e) {}
        return String(content);
    }

    async function loadUsers() {
        const r = await api({ action: "list-users" });
        names = {};
        const sel = $("user");
        sel.length = 1;
        (r.users || []).forEach((u) => {
            const id = u.userId || u.user_id || u.id;
            names[id] = u.displayName || u.display_name || id;
            const o = document.createElement("option");
            o.value = id; o.textContent = names[id];
            sel.append(o);
        });
    }

    async function search() {
        status("検索中...");
        try {
            const r = await api({ action: "search-messages", searchText: $("q").value.trim() || null,
                senderId: $("user").value || null, roomId: $("room").value.trim() || null, limit: PAGE, offset });
            const box = $("res"); box.textContent = "";
            (r.messages || []).forEach((m) => {
                const id = m.id || m.messageId, sender = m.sender_id || m.senderId, room = m.room_id || m.roomId;
                const d = document.createElement("div"); d.className = "card";
                const t = document.createElement("div"); t.textContent = bodyText(m.content);
                const meta = document.createElement("div"); meta.className = "m";
                meta.textContent = (names[sender] || sender) + " / room " + room;
                const del = document.createElement("button"); del.className = "d"; del.textContent = "削除";
                del.onclick = async () => {
                    const reason = prompt("削除理由（必須・500文字以内）");
                    if (!reason) return;
                    try { await api({ action: "delete-message", messageId: id, reason }); d.remove(); status("削除しました。"); }
                    catch (e) { status(e.message, true); }
                };
                const sus = document.createElement("button"); sus.className = "d"; sus.textContent = "ルーム停止";
                sus.onclick = async () => {
                    const reason = prompt("停止理由（必須）");
                    if (!reason) return;
                    try { await api({ action: "suspend-room", roomId: room, reason }); status("ルームを停止しました。"); }
                    catch (e) { status(e.message, true); }
                };
                d.append(t, meta, del, " ", sus); box.append(d);
            });
            status((r.messages || []).length ? loginNote : "該当するメッセージはありません。" + (loginNote ? "　" + loginNote : ""));
        } catch (e) { status(e.message, true); }
    }

    // 追加認証（TOTP）：管理者の判定には もう使いません（管理者はTomohikoのアカウントだけ・ログインだけで使える）。
    // 呼び出し元(ログイン処理)は そのまま使えるよう、空の案内を返す関数だけ残しています。
    async function ensureAal2() { return ""; }

    $("lf").addEventListener("submit", async (e) => {
        e.preventDefault(); status("ログイン中...");
        try {
            await window.AREAuth.login($("lid").value.trim(), $("lpw").value); $("lpw").value = "";
            const note = await ensureAal2();
            loginNote = note || "";
            await loadUsers(); $("who").textContent = "管理者としてログイン中"; show(true); status(loginNote); search();
        } catch (err) {
            await window.AREAuth.logout().catch(() => {}); show(false); status(err.message, true);
        }
    });
    $("sf").addEventListener("submit", (e) => { e.preventDefault(); offset = 0; search(); });
    $("prev").onclick = () => { offset = Math.max(0, offset - PAGE); search(); };
    $("next").onclick = () => { offset += PAGE; search(); };
    $("audit").onclick = async () => {
        try {
            const r = await api({ action: "list-audit-log", limit: 50, offset: 0 });
            const box = $("res"); box.textContent = "";
            (r.logs || []).forEach((l) => { const d = document.createElement("div"); d.className = "card"; d.textContent = JSON.stringify(l); box.append(d); });
        } catch (e) { status(e.message, true); }
    };
    $("out").onclick = async () => { await window.AREAuth.logout(); loginNote = ""; show(false); $("res").textContent = ""; status(""); };
});
