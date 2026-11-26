import sys, json, re, os, time, shutil, base64, subprocess
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
os.environ.setdefault("ARE_SRC", "/home/claude/r3/AREDA")
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:400]) if note else ""))
FX = "/tmp/imp_fx"
if not os.path.exists(FX + "/multi_openpyxl.xlsx"):
    subprocess.run(["python3", HERE + "/mk_imp_fixtures.py"], check=True)
    subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", FX, FX + "/two_tables.docx"], capture_output=True)
def F(*names): return [os.path.join(FX, n) for n in names]

EXTRA = """
window.__fx.persist = true;
window.__fx.tables.user_prefs = [];
window.__fx.tables.messages = [];
window.__fx.rpc.is_current_user_admin = function(){ return false; };
"""
SUM = """(it) => [it.s||'',it.e||'',it.n,it.w==null?'':it.w,it.m||'',it.c==null?'':it.c,it.k||'',it.st||'',it.aw==null?'':it.aw,it.as||'',it.ae||'',it.nt||'',it.r||0].join('|')"""

with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=820, extra_fx=EXTRA)
    dialogs = []
    page.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1800)
    page.evaluate("() => document.querySelector('[data-tool=\"itin\"]').click()"); page.wait_for_timeout(600)

    def goimp(mode="new"):
        page.evaluate("(m) => { itn.preview = null; itn.importTxt = ''; itn.importErrors = []; itn.importMode = m; itnGo('import'); }", mode); page.wait_for_timeout(150)
    def pick(paths, wait=12000, mode="new"):
        goimp(mode)
        page.locator('input[data-t="itin:file"]').set_input_files(paths)
        try:
            page.wait_for_function("() => itn.preview || (itn.importErrors && itn.importErrors.length)", timeout=wait)
        except Exception as e:
            pass
        page.wait_for_timeout(250)
        return page.evaluate("""(SUM) => { const f = eval(SUM); const pv = itn.preview;
            return {errs: itn.importErrors || [], kind: pv && pv.kind, note: pv && pv.note, title: pv && pv.title, date: pv && pv.date,
              items: pv && pv.items ? pv.items.map(f) : null,
              groups: pv && pv.groups ? pv.groups.map(g => ({on: g.on, title: g.title, date: g.date, items: g.items.map(f)})) : null}; }""", SUM)
    def names(r, i=None):
        its = r["items"] if i is None and r["items"] is not None else (r["groups"][i]["items"] if r["groups"] else [])
        return [x.split("|")[2] for x in its]

    # ---------- 1) 画面：ファイル選択の部品
    goimp()
    check("取り込み画面：ファイルを複数選べる（multiple）", page.evaluate("() => { const i = document.querySelector('input[data-t=\"itin:file\"]'); return !!i && i.multiple; }"))
    acc = page.evaluate("() => document.querySelector('input[data-t=\"itin:file\"]').accept")
    check("取り込み画面：10種類の拡張子を受け付ける", all(x in acc for x in [".json", ".xlsx", ".docx", ".csv", ".tsv", ".txt", ".md", ".ics", ".html", ".pdf"]), acc)
    check("画面に 10種類のチップが並ぶ", page.locator(".itn-chip").count() == 10, page.locator(".itn-chip").count())

    # ---------- 2) Excel
    r = pick(F("multi_openpyxl.xlsx"))
    check("Excel（3シート）：予定のあるシートだけ2つのまとまりになる", r["groups"] and [g["title"] for g in r["groups"]] == ["1日目", "2日目"], r["groups"] and [g["title"] for g in r["groups"]])
    check("Excel：時刻セル(h:mm)が 08:30 などの時刻になり、終了・待ち・金額・備考も入る", r["groups"] and r["groups"][0]["items"][1].startswith("09:00|09:45|アトラクションA|35|先に整理券|") , r["groups"] and r["groups"][0]["items"][:2])
    check("Excel：金額・日付・文字の時刻（9:00-10:00）も読める", r["groups"] and r["groups"][0]["date"] == "2026-11-21" and r["groups"][1]["items"][1].split("|")[:3] == ["10:30", "11:30", "お土産"] and r["groups"][1]["items"][1].split("|")[5] == "800", r["groups"])
    check("Excel：予定でないシート（もちもの）をとばした知らせが出る", "シートが 3枚" in (r["note"] or "") and "とばし" in (r["note"] or ""), r["note"])
    r = pick(F("single_text_times.xlsx"))
    check("Excel（1シート・文字の時刻・¥・15分）", r["items"] and r["items"][0].startswith("09:00||朝ごはん||") and r["items"][0].split("|")[5] == "600" and r["items"][1].split("|")[3] == "15", r["items"])
    r = pick(F("renamed_xlsx.txt"))
    check("拡張子が .txt でも 中身がExcelなら Excelとして読む", r["kind"] == "Excel" and r["items"] and len(r["items"]) == 2, r["kind"])

    # ---------- 3) Word
    r = pick(F("two_tables.docx"))
    check("Word（表が3つ・見出し2つ）：予定の表2つだけ。見出しが名前になる", r["groups"] and [g["title"] for g in r["groups"]] == ["1日目", "2日目"] and [len(g["items"]) for g in r["groups"]] == [4, 3], r["groups"] and [(g["title"], len(g["items"])) for g in r["groups"]])
    check("Word：「08:30–09:00」の範囲、「35分」「¥800」が読める", r["groups"] and r["groups"][0]["items"][0].startswith("08:30|09:00|駅に集合") and r["groups"][0]["items"][1].split("|")[3] == "35" and r["groups"][1]["items"][1].split("|")[5] == "800", r["groups"] and r["groups"][0]["items"][:2])
    r = pick(F("paragraphs_only.docx"))
    check("Word（表なし・段落だけ）も読める", r["items"] and len(r["items"]) >= 4 and any("アトラクションA" in x for x in r["items"]), r["items"])

    # ---------- 4) PDF
    r = pick(F("table_text.pdf"))
    check("PDF（文字入り・日本語）：表を読み、空のマスがあっても 列がずれない", r["items"] and r["items"][0].startswith("08:30|09:00|駅に集合|") and r["items"][0].split("|")[4] == "改札の前" and r["items"][1].split("|")[3] == "35" and r["items"][3].split("|")[4] == "予約ずみ", r["items"])
    check("PDF：「表がくずれることがある」と知らせる", "PDF" in (r["note"] or "") and "確かめ" in (r["note"] or ""), r["note"])
    if os.path.exists(FX + "/two_tables.pdf"):
        r = pick(F("two_tables.pdf"))
        check("PDF（表が2つ）：2つのまとまりに分かれ、見出しが名前になる", r["groups"] and len(r["groups"]) == 2 and "日目" in r["groups"][0]["title"], r["groups"] and [(g["title"], len(g["items"])) for g in r["groups"]])
    r = pick(F("no_text.pdf"))
    check("PDF（文字なし）：「画像だけのPDF」と わかりやすく断る", r["errs"] and "画像だけ" in r["errs"][0] and not r["items"] and not r["groups"], r["errs"])

    # ---------- 5) CSV / TSV / テキスト / Markdown / HTML / ICS / JSON
    for nm in ["utf8_bom.csv", "sjis.csv"]:
        r = pick(F(nm))
        check("CSV：" + nm + "（引用符・カンマ・改行つきのマス）", r["items"] and r["items"][0].startswith("09:00|09:45|カフェ, 朝|") and "1行目" in r["items"][0] and len(r["items"]) == 2, r["items"])
    r = pick(F("semicolon.csv")); check("CSV：セミコロン区切り", r["items"] and r["items"][0].startswith("09:00||集合|5|"), r["items"])
    r = pick(F("headerless.csv")); check("CSV：見出しなし（時刻・内容・備考の順）", r["items"] and r["items"][0].startswith("09:00||集合||駅"), r["items"])
    r = pick(F("formula_guard.csv"))
    check("CSV：このアプリの書き出し（全項目・先頭の ' をはずす）", r["items"] and r["items"][0] == "09:00|09:45|=危ない名前|35|-備考|1200|||x|40|09:05|09:50|@メモ|3".replace("|||x|", "||x|") or (r["items"] and r["items"][0].split("|")[2] == "=危ない名前" and r["items"][0].split("|")[4] == "-備考" and r["items"][0].split("|")[11] == "@メモ"), r["items"])
    r = pick(F("plain.tsv")); check("TSV（タブ区切り）", r["items"] and len(r["items"]) == 2 and r["items"][1].startswith("10:00|10:45|アトラクション|30"), r["items"])
    r = pick(F("utf16.tsv")); check("TSV：UTF-16（BOMつき）も読める", r["items"] and len(r["items"]) == 2, r["items"])
    r = pick(F("memo_sjis.txt")); check("テキスト：Shift_JIS も文字化けしない", r["items"] and r["items"][0].split("|")[2] == "集合", r["items"])
    r = pick(F("sections.txt")); check("テキスト：【1日目】【2日目】で2つに分かれる", r["groups"] and [g["title"] for g in r["groups"]] == ["1日目", "2日目"], r["groups"] and [g["title"] for g in r["groups"]])
    r = pick(F("two_sections.md")); check("Markdown：見出しごとに分かれ、表も箇条書きも読める（太字・リンク記号はとれる）", r["groups"] and [g["title"] for g in r["groups"]] == ["土曜日", "日曜日"] and r["groups"][0]["items"][0].split("|")[2] == "朝食" and r["groups"][0]["items"][1].split("|")[2] == "水族館" and len(r["groups"][1]["items"]) == 3, r["groups"])
    r = pick(F("list_only.md")); check("Markdown：箇条書きだけ", r["items"] and len(r["items"]) == 3 and r["items"][2].split("|")[5] == "1200", r["items"])
    r = pick(F("two_tables.html"))
    check("HTML：表ごとに分かれ（caption／見出しが名前）、script は動かない", r["groups"] and [g["title"] for g in r["groups"]] == ["1日目の予定", "2日目"] and not dialogs and page.evaluate("() => typeof window.__xss") == "undefined", (r["groups"] and [g["title"] for g in r["groups"]], dialogs))
    r = pick(F("sheets_like.html")); check("HTML：Googleスプレッドシートの書き出し（行番号つき表）も読める", r["items"] and len(r["items"]) == 2 and r["items"][0].split("|")[2] == "集合", r["items"])
    r = pick(F("google_like.ics"))
    gs = r["groups"] or []
    check("カレンダー(ICS)：日ごとに分かれる", len(gs) == 2 and gs[0]["date"] == "2026-11-21" and gs[1]["date"] == "2026-11-22", [(g["title"], g["date"]) for g in gs])
    check("ICS：UTC→日本時間(03:00Z→12:00)・終日・場所とメモ・取り消しは とばす・長い行の折り返し", gs and any(x.startswith("12:00|13:00|UTCの予定") for x in gs[0]["items"]) and any("終日" in x for x in gs[0]["items"]) and not any("中止" in x for x in gs[0]["items"]) and any("公園" in x for x in gs[0]["items"]) and any("あいうえお" in x for x in gs[1]["items"]), gs and gs[0]["items"])
    check("ICS：くり返しの予定は 最初の1回だけ（知らせが出る）", "くり返し" in (r["note"] or ""), r["note"])
    r = pick(F("foreign_array.json")); check("JSON：他のソフトの形（name/start/end/cost）", r["items"] and r["items"][0].startswith("09:00|09:30|Breakfast") and r["items"][0].split("|")[5] == "600" and r["items"][1].split("|")[3] == "25", r["items"])
    r = pick(F("multi_plans.json")); check("JSON：予定表が2つ入ったファイル → 2つのまとまり", r["groups"] and [g["title"] for g in r["groups"]] == ["A案", "B案"] and r["groups"][1]["date"] == "2026-11-22", r["groups"])

    # ---------- 6) 複数ファイル
    r = pick(F("memo1.txt", "memo2.txt", "memo3.txt"))
    check("txt を3つ選ぶと、3つのまとまりになる（名前は ファイル名・見出し）", r["groups"] and len(r["groups"]) == 3 and r["groups"][0]["title"].startswith("memo1") and r["groups"][2]["title"] == "memo3", r["groups"] and [g["title"] for g in r["groups"]])
    check("txt 3つ：件数は 2・3・2", r["groups"] and [len(g["items"]) for g in r["groups"]] == [2, 3, 2], r["groups"] and [len(g["items"]) for g in r["groups"]])
    r = pick(F("memo1.txt", "memo2.txt"))
    check("txt を2つ選んでも（2つ以上）同じく まとまりごとに分かれる", r["groups"] and len(r["groups"]) == 2, r["groups"] and len(r["groups"]))
    r = pick(F("multi_openpyxl.xlsx", "two_tables.docx", "utf8_bom.csv", "empty.txt", "legacy.xls"))
    check("種類のちがうファイルを 5つ一度に：読めた3つが まとまりになる（5まとまり）", r["groups"] and len(r["groups"]) == 5, r["groups"] and [g["title"] for g in r["groups"]])
    check("一度に選んだ中に 読めないものがあっても、読めたものは取り込める・エラーは個別に出る", len(r["errs"]) == 2 and "empty.txt" in r["errs"][0] and "legacy.xls" in r["errs"][1], r["errs"])
    check("エラー文がやさしい日本語（.xls の保存し直し案内）", "xlsx" in r["errs"][1] and "保存し直して" in r["errs"][1], r["errs"][1])
    # 画面にエラーが見える
    check("画面に 読めなかったファイルの理由が出る", "empty.txt" in page.inner_text("#itnRoot") and "legacy.xls" in page.inner_text("#itnRoot"))
    r = pick(F("memo1.txt", "memo2.txt", "memo3.txt", "sections.txt", "two_sections.md", "two_tables.html", "google_like.ics", "multi_plans.json", "utf8_bom.csv", "plain.tsv", "multi_openpyxl.xlsx", "two_tables.docx", "table_text.pdf", "list_only.md", "sheets_like.html", "semicolon.csv", "headerless.csv", "foreign_array.json", "single_text_times.xlsx", "paragraphs_only.docx", "memo_sjis.txt"))
    check("21個を一度に選ぶと 20個までにして知らせる（21個目の memo は入らない）", r["groups"] is not None and "20個まで" in (r["note"] or "") and not any(g["title"].startswith("memo_sjis") for g in r["groups"]), (len(r["groups"] or []), r["errs"], r["note"]))

    # ---------- 7) エラー・こわれたファイル
    for nm, word in [("empty.txt", "空"), ("legacy.xls", "xlsx"), ("encrypted_like.docx", "パスワード"), ("random.zip", "ZIP"), ("truncated.xlsx", "開けません"), ("bomb.xlsx", "大きすぎ"), ("big.txt", "大きすぎ"), ("broken.json", "JSON")]:
        r = pick(F(nm))
        check("エラー：" + nm + " → わかりやすい文が出て、何も取り込まれない", r["errs"] and word in r["errs"][0] and not r["items"] and not r["groups"], r["errs"])
    check("ダイアログ（alert）は 1つも出ていない", not dialogs, dialogs)

    # ---------- 8) 取り込みの実行（新しい予定表／まとまりの選択・名前変更／追加／置きかえ）
    page.evaluate("() => { itn.plans = {}; itn.active = ''; }")
    r = pick(F("multi_openpyxl.xlsx", "memo1.txt"))
    check("まとまりの一覧が画面に出る（3つ）", page.locator(".itn-grp").count() == 3, page.locator(".itn-grp").count())
    page.locator('[data-t="itin:grp"][data-f="on"][data-g="2"]').uncheck(); page.wait_for_timeout(250)
    check("チェックを外すと そのまとまりが 薄くなる（取り込まない）", page.locator(".itn-grp.off").count() == 1 and page.evaluate("() => itn.preview.groups[2].on") is False)
    page.locator('[data-t="itin:grp"][data-f="title"][data-g="0"]').fill("テスト 1日目"); page.locator('[data-t="itin:grp"][data-f="title"][data-g="0"]').dispatch_event("change")
    page.locator('[data-t="itin:doimport"]').click(); page.wait_for_timeout(500)
    st = page.evaluate("() => ({n: Object.keys(itn.plans).length, titles: Object.values(itn.plans).map(p => p.title).sort(), counts: Object.values(itn.plans).map(p => p.items.length).sort(), tab: itn.tab, sub: itn.sub})")
    check("取り込み：選んだ2つが 2つの予定表になり、名前変更も効く", st["n"] == 2 and "テスト 1日目" in st["titles"] and "multi_openpyxl・2日目" in st["titles"] and st["counts"] == [3, 4] and st["tab"] == "list", st)
    check("取り込んだ項目に 内部の番号(i)が ちゃんと振られ、重複しない", page.evaluate("() => Object.values(itn.plans).every(p => p.items.every(x => x.i) && new Set(p.items.map(x => x.i)).size === p.items.length)"))
    check("取り込んだ予定表の日付が入る（xlsxの2026-11-21／なしは今日）", page.evaluate("() => { const a = Object.values(itn.plans).find(p => p.title === 'テスト 1日目'); const b = Object.values(itn.plans).find(p => p.title === 'multi_openpyxl・2日目'); return a.date === '2026-11-21' && /^\\d{4}-\\d{2}-\\d{2}$/.test(b.date); }"))
    # 1つのファイル：追加／置きかえ
    cur = page.evaluate("() => itn.active")
    n0 = page.evaluate("() => itnPlan().items.length")
    goimp("add"); page.locator('input[data-t="itin:file"]').set_input_files(F("plain.tsv")); page.wait_for_function("() => itn.preview", timeout=8000); page.wait_for_timeout(250)
    check("いまの予定表があると、取り込みかたに「追加」が出る（はじめは追加）", page.evaluate("() => document.getElementById('itnImpMode').value") == "add")
    page.locator('[data-t="itin:doimport"]').click(); page.wait_for_timeout(500)
    check("追加：件数がふえる", page.evaluate("() => itnPlan().items.length") == n0 + 2, (n0, page.evaluate("() => itnPlan().items.length")))
    goimp(); page.locator('input[data-t="itin:file"]').set_input_files(F("plain.tsv")); page.wait_for_function("() => itn.preview", timeout=8000); page.wait_for_timeout(250)
    page.select_option("#itnImpMode", "replace"); page.locator('[data-t="itin:doimport"]').click(); page.wait_for_timeout(500)
    check("置きかえ：中身が取り込んだ分だけになる", page.evaluate("() => itnPlan().items.length") == 2)
    # 件数の上限
    page.evaluate("() => { const p = itnPlan(); p.items = []; for(let i = 0; i < 149; i++) p.items.push(itnCleanItem({n: 'x' + i, s: '09:00'})); itnTouch(p); }")
    goimp(); page.locator('input[data-t="itin:file"]').set_input_files(F("plain.tsv")); page.wait_for_function("() => itn.preview", timeout=8000); page.wait_for_timeout(250)
    page.select_option("#itnImpMode", "add"); page.locator('[data-t="itin:doimport"]').click(); page.wait_for_timeout(400)
    check("追加で150件を超えるときは 取り込まず、理由を出す（件数は149のまま）", page.evaluate("() => itnPlan().items.length") == 149, page.evaluate("() => itnPlan().items.length"))
    page.select_option("#itnImpMode", "replace"); page.locator('[data-t="itin:doimport"]').click(); page.wait_for_timeout(400)
    check("置きかえなら 150件の枠は あきなおるので 取り込める（バグ修正の確認）", page.evaluate("() => itnPlan().items.length") == 2)
    # 予定表の数の上限（30）
    page.evaluate("() => { itn.plans = {}; for(let i = 0; i < 29; i++) itnNewPlan('p' + i, '2026-11-21', []); }")
    pick(F("memo1.txt", "memo2.txt", "memo3.txt"))
    page.locator('[data-t="itin:doimport"]').click(); page.wait_for_timeout(400)
    check("予定表が30個を超えるときは 作らず、理由を出す（29個のまま）", page.evaluate("() => Object.keys(itn.plans).length") == 29, page.evaluate("() => Object.keys(itn.plans).length"))
    page.locator('[data-t="itin:grp"][data-f="on"][data-g="2"]').uncheck(); page.wait_for_timeout(200)
    page.locator('[data-t="itin:grp"][data-f="on"][data-g="1"]').uncheck(); page.wait_for_timeout(200)
    page.locator('[data-t="itin:doimport"]').click(); page.wait_for_timeout(400)
    check("選びなおして 30個ちょうどなら 作れる", page.evaluate("() => Object.keys(itn.plans).length") == 30)
    page.evaluate("() => { itn.plans = {}; itn.active = ''; }")

    # ---------- 9) 貼りつけ（今までの方法）は そのまま
    goimp(); page.fill("#itnImpTxt", "【2026年11月21日】\n9:00\t9:45\tアトラクションA 待ち35分\n10:00\t10:30\tショー\n"); page.locator('[data-t="itin:parse"]').click(); page.wait_for_timeout(300)
    check("貼りつけて「読み取る」も 今までどおり動く", "2件" in page.inner_text("#itnRoot"), page.inner_text("#itnRoot")[:160])
    page.locator('[data-t="itin:sample"]').click(); page.wait_for_timeout(300)
    check("「例を入れる」で 入力欄に例が入る", len(page.input_value("#itnImpTxt")) > 20)
    # 画面を出ると エラー表示が消える
    page.evaluate("() => { itn.importErrors = ['x.txt：テスト']; }"); page.evaluate("() => itnGo('list')"); page.wait_for_timeout(200)
    check("取り込み画面を出ると、エラー表示がクリアされる", page.evaluate("() => itn.importErrors.length") == 0)

    # ---------- 10) 書き出し → 取り込み（ぐるっと一周）
    page.evaluate("""() => { itn.plans = {}; const p = itnNewPlan('一周テスト', '2026-11-21', [
        {n: 'アトラクションA', s: '09:00', e: '09:45', w: 35, c: 1200, m: '先に整理券', k: 'show', st: 'x', aw: 40, as: '09:05', ae: '09:50', nt: 'おもしろかった', r: 4},
        {n: 'ランチ', s: '12:00', e: '13:00', w: 15, c: 1500, m: '予約ずみ', k: 'eat', st: 't'},
        {n: '=SUM(1,2)を含む名前', s: '14:00', m: '+メモ', k: 'other', st: 's'},
        {n: '時刻なしの予定', k: 'act', st: 't'}]); }""")
    exp = page.evaluate("() => itnPlan().items.map(" + SUM + ")")
    core = lambda x: "|".join(x.split("|")[:8])
    roundtrip = page.evaluate("""async () => {
        const plan = itnPlan(), out = {}, mk = (b, n, t) => new File([b], n, {type: t || ''});
        const files = {
            json: mk(JSON.stringify({app: 'ARE-itin', v: 1, plan: itnPackPlan(plan)}), 'a.json'),
            csv: mk(itnCsv(plan), 'a.csv'), txt: mk(itnTxt(plan), 'a.txt'), html: mk(itnHtml(plan), 'a.html'), ics: mk(itnIcs(plan), 'a.ics'),
            xlsx: mk(itnXlsx(plan), 'a.xlsx'), docx: mk(itnDocx(plan), 'a.docx')};
        for(const k of Object.keys(files)){
            try{ const r = await itnImportFiles([files[k]]); const g = r.groups[0]; out[k] = {n: g ? g.items.length : -1, items: g ? g.items.map(""" + SUM + """) : [], errs: r.errors, title: g && g.title}; }
            catch(e){ out[k] = {err: String(e && e.message || e)}; }
        }
        return out; }""")
    for k in ["json", "xlsx", "csv"]:
        rt = roundtrip[k]
        check("一周（" + k + "）：4件・全項目（実績・★・メモ）が そのまま戻る", rt.get("items") == exp, (rt.get("items"), exp) if rt.get("items") != exp else "")
    rt = roundtrip["ics"]
    check("一周（ics）：時刻のある3件が戻る（時刻なしの予定は カレンダーに入らない）", rt.get("n") == 3 and [x.split("|")[2] for x in rt["items"]] == [x.split("|")[2] for x in exp[:3]] and [x.split("|")[0] for x in rt["items"]] == [x.split("|")[0] for x in exp[:3]], rt)
    for k in ["txt", "html", "docx"]:
        rt = roundtrip[k]
        ok = rt.get("n") == 4 and [x.split("|")[2] for x in rt["items"]] == [x.split("|")[2] for x in exp] and [x.split("|")[0] for x in rt["items"]] == [x.split("|")[0] for x in exp]
        check("一周（" + k + "）：4件・名前と開始時刻が戻る", ok, rt.get("err") or (rt.get("items"), exp))
    # 細かいところ（待ち・金額・状態）
    for k in ["txt", "html", "docx"]:
        rt = roundtrip.get(k, {}).get("items") or []
        ok = len(rt) == 4 and rt[0].split("|")[3] == "35" and rt[0].split("|")[5] == "1200" and rt[1].split("|")[3] == "15"
        check("一周（" + k + "）：待ち時間・金額も戻る", ok, rt[:2])
    st_back = [x.split("|")[7] for x in (roundtrip["txt"].get("items") or [])]
    check("一周（txt）：完了・スキップの状態も戻る", st_back[:3] == ["x", "t", "s"], st_back)
    # 取り込んだ予定表を、もういちど書き出しても同じ（安定）
    rt2 = page.evaluate("""async () => { const plan = itnPlan(); const f = new File([JSON.stringify({app:'ARE-itin', v:1, plan: itnPackPlan(plan)})], 'b.json');
        const r = await itnImportFiles([f]); const g = r.groups[0]; const np = itnNewPlan('again', g.date || '2026-11-21', g.items);
        const f2 = new File([itnCsv(np)], 'b.csv'); const r2 = await itnImportFiles([f2]); return r2.groups[0].items.map(""" + SUM + """); }""")
    check("書き出し→取り込み→書き出し→取り込み を重ねても 内容が変わらない", rt2 == exp, rt2)

    # ---------- 11) 安全（文字の中のタグ・巨大な入力）
    r = page.evaluate("""async () => { const f = new File(['<table><tr><th>時刻</th><th>内容</th></tr><tr><td>9:00</td><td><img src=x onerror="window.__xss=1">あぶない</td></tr></table>'], 'x.html', {type: 'text/html'});
        const res = await itnImportFiles([f]); itn.preview = itnImpPreviewOf(res); itnGo('import'); return {items: itn.preview.items.map(i => i.n)}; }""")
    page.wait_for_timeout(300)
    check("HTMLの中の <img onerror> は 実行されず、画面にタグとして出ない", page.evaluate("() => typeof window.__xss") == "undefined" and page.locator("#itnRoot img").count() == 0, r)
    page.evaluate("() => { itn.preview = null; itnGo('list'); }")
    check("ファイル名・見出しの <script> は 画面で文字になる", page.evaluate("""async () => { const f = new File(['9:00 集合\\n'], '<script>window.__x2=1</script>.txt'); const r = await itnImportFiles([f]); itn.preview = itnImpPreviewOf(r); itnGo('import'); return typeof window.__x2 === 'undefined' && !document.querySelector('#itnRoot script'); }"""))
    page.evaluate("() => { itn.preview = null; itnGo('list'); }")

    # ---------- 12) 画面のエラー・ふつうの表示
    errs = [l for l in logs if re.search(r"error|Error|Uncaught", str(l)) and "favicon" not in str(l)]
    check("画面のエラー（console）なし", not errs, errs[:3])
    browser.close()

print("合計", len(res), "失敗", res.count(False))
sys.exit(1 if False in res else 0)
