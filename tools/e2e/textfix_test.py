import sys, json, re
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:240]) if note else ""))
EXTRA = """
window.__fx.tables.messages = [];
window.__fx.rpc.send_message = function(a){ window.__fx.tables.messages.push({id:'mx'+Math.random(), room_id:a.p_room_id, sender_id:'u-me', content:a.p_content, created_at:new Date().toISOString(), edited_at:null, expires_at:null, is_auto_reply:false}); return 'ok'; };
window.__fx.rpc.is_current_user_admin = function(){ return false; };
"""
JA = ("こんにちは、世界。これは文字化けのテストです。\r\n日本語のファイルを送ります。漢字・ひらがな・カタカナ（ＡＢＣ１２３）～★①\r\n").encode("utf-8").decode("utf-8")
JA = JA * 3
BOM = b"\xef\xbb\xbf"
SAMPLES = {
  "sjis.txt":   JA.encode("cp932"),
  "eucjp.txt":  JA.encode("euc_jp", errors="ignore"),
  "jis.txt":    JA.encode("iso2022_jp_ext", errors="ignore"),
  "u16le.txt":  b"\xff\xfe" + JA.encode("utf-16-le"),
  "u16be.txt":  b"\xfe\xff" + JA.encode("utf-16-be"),
  "utf8.txt":   JA.encode("utf-8"),
  "utf8bom.txt": BOM + JA.encode("utf-8"),
  "ascii.txt":  b"hello world\r\nplain ascii only\r\n",
  "sjis.md":    JA.encode("cp932"),
  "sjis.json":  json.dumps({"名前": "山田太郎", "メモ": "日本語のテスト"}, ensure_ascii=False).encode("cp932"),
  "sjis.csv":   "名前,年齢\r\n山田太郎,20\r\n佐藤花子,31\r\n".encode("cp932"),
  "kanji_sjis.txt": "山田太郎\r\n佐藤花子\r\n鈴木一郎\r\n".encode("cp932"),
  "kanji_euc.txt":  "山田太郎\r\n佐藤花子\r\n鈴木一郎\r\n".encode("euc_jp"),
  "sjis.ics":   JA.encode("cp932"),
  "sjis.vcf":   JA.encode("cp932"),
  "binary.txt": b"\x00\x01\x02\xff\xfe\x80\x81abc\x00\x90",
  "latin1.txt": "café résumé naïve façade".encode("latin-1"),
  "empty.txt":  b"",
}
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=EXTRA)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1500)
    page.locator("#roomList > *").filter(has_text="みどり").first.click(); page.wait_for_timeout(1200)
    page.evaluate("window.__uploads = []")
    page.set_input_files("#fileInput", [{"name": n, "mimeType": "", "buffer": b} for n, b in SAMPLES.items()])
    for _ in range(80):
        page.wait_for_timeout(400)
        if len(page.evaluate("window.__uploads")) >= len(SAMPLES): break
    ups = page.evaluate("window.__uploads")
    check(f"{len(SAMPLES)} 個がすべて送られた", len(ups) == len(SAMPLES), len(ups))
    # アップロード順は送った順。名前で引く（path の最後の拡張子だけでは区別できないので順番で対応づけ）
    by = {}
    for (n, _b), u in zip(SAMPLES.items(), ups): by[n] = u
    def body(n): return bytes(by[n]["bytes"] or [])
    def ctype(n): return (by[n]["o"] or {}).get("contentType")
    EXPECT = {"eucjp.txt": SAMPLES["eucjp.txt"].decode("euc_jp"), "jis.txt": SAMPLES["jis.txt"].decode("iso2022_jp_ext")}   # EUC-JP・JIS に入らない文字（①など）を除いた、見本どおりの文章
    def decoded_ok(n, bom_expected):
        b = body(n)
        if bom_expected: 
            if not b.startswith(BOM): return False
            b = b[3:]
        return b.decode("utf-8") == EXPECT.get(n, JA)
    for n, label, bom in [("sjis.txt", "Shift_JIS", True), ("eucjp.txt", "EUC-JP", True), ("jis.txt", "JIS（ISO-2022-JP）", True), ("u16le.txt", "UTF-16（LE・目印あり）", True), ("u16be.txt", "UTF-16（BE・目印あり）", True)]:
        check(f"{n}：{label} → UTF-8 に直って送られる（txt は先頭に目印つき）", decoded_ok(n, bom), body(n)[:24])
    check("sjis.md：直って送られる（md には目印を付けない）", decoded_ok("sjis.md", False), body("sjis.md")[:12])
    j = body("sjis.json")
    check("sjis.json：直って送られる（json には目印を付けない）、読み込める", (not j.startswith(BOM)) and json.loads(j.decode("utf-8")) == {"名前": "山田太郎", "メモ": "日本語のテスト"}, j[:30])
    c = body("sjis.csv")
    check("sjis.csv：直って送られる（csv には Excel 用の目印つき）", c.startswith(BOM) and c[3:].decode("utf-8") == "名前,年齢\r\n山田太郎,20\r\n佐藤花子,31\r\n", c[:24])
    check("漢字だけの短い Shift_JIS も直る", body("kanji_sjis.txt")[3:].decode("utf-8") == "山田太郎\r\n佐藤花子\r\n鈴木一郎\r\n", body("kanji_sjis.txt")[:20])
    check("漢字だけの短い EUC-JP も直る", body("kanji_euc.txt")[3:].decode("utf-8") == "山田太郎\r\n佐藤花子\r\n鈴木一郎\r\n", body("kanji_euc.txt")[:20])
    check("すでに UTF-8 のファイルは、1 バイトも変えない", body("utf8.txt") == SAMPLES["utf8.txt"] and body("utf8bom.txt") == SAMPLES["utf8bom.txt"] and body("ascii.txt") == SAMPLES["ascii.txt"])
    check("UTF-8 と確かめたものは、保存先に charset=utf-8 つきで渡す", all(ctype(n) == "text/plain;charset=utf-8" for n in ["utf8.txt", "utf8bom.txt", "ascii.txt", "sjis.txt", "u16le.txt"]), [ctype(n) for n in ["utf8.txt", "sjis.txt"]])
    check("直した md・json・csv の種類も charset つき（json は付けない）", ctype("sjis.md") == "text/markdown;charset=utf-8" and ctype("sjis.csv") == "text/csv;charset=utf-8" and ctype("sjis.json") == "application/json", [ctype("sjis.md"), ctype("sjis.csv"), ctype("sjis.json")])
    check("ics・vcf（中に文字コードが書いてある形式）は触らない", body("sjis.ics") == SAMPLES["sjis.ics"] and body("sjis.vcf") == SAMPLES["sjis.vcf"])
    check("バイナリ・読めない文字コードは、触らず、charset も付けない", body("binary.txt") == SAMPLES["binary.txt"] and body("latin1.txt") == SAMPLES["latin1.txt"] and ctype("binary.txt") == "text/plain" and ctype("latin1.txt") == "text/plain", [ctype("binary.txt"), ctype("latin1.txt")])
    check("空のファイルも、そのまま送れる", len(ups) == len(SAMPLES) and by["empty.txt"]["size"] == 0)
    # メッセージ：名前・サイズは直したあとの大きさ
    msgs = [json.loads(m["content"]) for m in page.evaluate("window.__fx.tables.messages")]
    sj = [m for m in msgs if m.get("name") == "sjis.txt"]
    check("メッセージの大きさが、直したあとのファイルと同じ", sj and sj[0]["size"] == len(body("sjis.txt")), sj[:1])
    # お知らせ（トースト）
    toast = page.evaluate("document.getElementById('toast') && document.getElementById('toast').textContent")
    check("画面に『UTF-8 に直して送りました』のお知らせが出る（直した名前と元の文字コード入り）", toast and "UTF-8 に直して送りました" in toast and "sjis.txt" in toast and "Shift_JIS" in toast and "EUC-JP" in toast, toast)
    # 1個だけのとき
    page.evaluate("window.__uploads = []")
    page.set_input_files("#fileInput", [{"name": "メモ.txt", "mimeType": "text/plain", "buffer": SAMPLES["sjis.txt"]}])
    for _ in range(40):
        page.wait_for_timeout(300)
        if page.evaluate("window.__uploads.length") >= 1: break
    page.wait_for_timeout(300)
    t1 = page.evaluate("document.getElementById('toast').textContent")
    check("1個だけのときのお知らせ", "「メモ.txt」" in t1 and "Shift_JIS でした" in t1 and "UTF-8 に直して送りました" in t1, t1)
    # すべて UTF-8 のときはお知らせなし
    page.evaluate("document.getElementById('toast').textContent=''; document.getElementById('toast').classList.remove('show'); window.__uploads = []")
    page.set_input_files("#fileInput", [{"name": "ok.txt", "mimeType": "text/plain", "buffer": SAMPLES["utf8.txt"]}])
    for _ in range(40):
        page.wait_for_timeout(300)
        if page.evaluate("window.__uploads.length") >= 1: break
    page.wait_for_timeout(300)
    t2 = page.evaluate("document.getElementById('toast').textContent")
    check("UTF-8 のファイルを送ったときは『直した』お知らせを出さない", "直して" not in (t2 or ""), t2)
    # 10MB 超は調べずにそのまま送る
    big = (JA.encode("cp932") * 40000)[: 10 * 1024 * 1024 + 10]
    page.evaluate("window.__uploads = []")
    page.set_input_files("#fileInput", [{"name": "big.txt", "mimeType": "", "buffer": big}])
    for _ in range(80):
        page.wait_for_timeout(300)
        if page.evaluate("window.__uploads.length") >= 1: break
    u = page.evaluate("window.__uploads[0] && {size: window.__uploads[0].size, type: window.__uploads[0].o && window.__uploads[0].o.contentType}")
    check("10MB を超える文字のファイルは、中身を調べずそのまま送る（大きさが変わらない）", u and u["size"] == len(big) and u["type"] == "text/plain", u)
    errs = [l for l in logs if l[0] in ("pageerror",)]
    check("画面のエラーなし", not errs, errs[:2])
    browser.close()
print("合計", len(res), "失敗", res.count(False))
