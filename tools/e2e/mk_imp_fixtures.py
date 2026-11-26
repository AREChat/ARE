import os, io, datetime, zipfile, json
FX = "/tmp/imp_fx"
os.makedirs(FX, exist_ok=True)
def w(name, data):
    p = os.path.join(FX, name)
    with open(p, "wb") as f: f.write(data)
    return p

DAY1 = [("08:30","09:00","駅に集合",None,None,"改札の前"),
        ("09:00","09:45","アトラクションA",35,None,"先に整理券"),
        ("10:00","10:30","ショー",None,1200,""),
        ("11:30","12:30","ランチ",None,1500,"予約ずみ")]
DAY2 = [("09:00","10:00","ホテル出発",None,None,""),
        ("10:30","11:30","お土産",None,800,"お菓子"),
        ("13:00","14:00","帰りの電車",None,2400,"指定席")]

# ---------- xlsx（openpyxl）：実際の時刻セル・数値・複数シート ----------
import openpyxl
wb = openpyxl.Workbook()
ws = wb.active; ws.title = "1日目"
ws.append(["2026/11/21 おでかけ"]); ws.append([])
ws.append(["開始","終了","内容","待ち時間(分)","金額","備考"])
for s,e,n,wt,c,m in DAY1:
    h1,m1 = map(int,s.split(":")); h2,m2 = map(int,e.split(":"))
    ws.append([datetime.time(h1,m1), datetime.time(h2,m2), n, wt, c, m])
for r in range(4, 8):
    ws.cell(r,1).number_format = "h:mm"; ws.cell(r,2).number_format = "h:mm"
ws2 = wb.create_sheet("2日目")
ws2.append(["内容","時間","費用","メモ"])
for s,e,n,wt,c,m in DAY2:
    ws2.append([n, s+"-"+e, c, m])
ws3 = wb.create_sheet("もちもの")
ws3.append(["持ち物","個数"]); ws3.append(["傘",1]); ws3.append(["充電器",1])
wb.save(os.path.join(FX,"multi_openpyxl.xlsx"))
wb1 = openpyxl.Workbook(); s1 = wb1.active; s1.title="Sheet1"
s1.append(["時刻","内容","待ち","費用"]); s1.append(["9:00","朝ごはん","", "¥600"]); s1.append(["10:00","散歩","15分",""])
wb1.save(os.path.join(FX,"single_text_times.xlsx"))

# ---------- docx（python-docx）----------
import docx
d = docx.Document()
d.add_heading("1日目", level=1)
t = d.add_table(rows=1, cols=4); t.style = "Table Grid"
for i,h in enumerate(["時刻","内容","待ち","備考"]): t.rows[0].cells[i].text = h
for s,e,n,wt,c,m in DAY1:
    r = t.add_row().cells; r[0].text = s+"–"+e; r[1].text = n; r[2].text = (str(wt)+"分") if wt else ""; r[3].text = m
d.add_heading("2日目", level=1)
t2 = d.add_table(rows=1, cols=3); t2.style = "Table Grid"
for i,h in enumerate(["開始","内容","費用"]): t2.rows[0].cells[i].text = h
for s,e,n,wt,c,m in DAY2:
    r = t2.add_row().cells; r[0].text = s; r[1].text = n; r[2].text = ("¥{:,}".format(c) if c else "")
d.add_table(rows=2, cols=2).rows[0].cells[0].text = "ただの表"
d.save(os.path.join(FX,"two_tables.docx"))
d2 = docx.Document()
d2.add_paragraph("2026年11月21日（土）おでかけ")
for s,e,n,wt,c,m in DAY1: d2.add_paragraph(f"{s} {n}" + (f" 待ち{wt}分" if wt else ""))
d2.save(os.path.join(FX,"paragraphs_only.docx"))

# ---------- PDF（reportlab、日本語の文字入り。CIDフォント）----------
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
pdfmetrics.registerFont(UnicodeCIDFont("HeiseiKakuGo-W5"))
c = canvas.Canvas(os.path.join(FX,"table_text.pdf"))
c.setFont("HeiseiKakuGo-W5", 12)
c.drawString(60, 790, "2026年11月21日（土） おでかけ")
cols = [60, 140, 220, 380, 450]
y = 760
for row in [["開始","終了","内容","待ち","備考"]] + [[s,e,n,(str(wt)+"分") if wt else "", m] for s,e,n,wt,cst,m in DAY1]:
    for x,v in zip(cols,row): c.drawString(x, y, v)
    y -= 22
c.showPage(); c.save()
c = canvas.Canvas(os.path.join(FX,"no_text.pdf")); c.showPage(); c.save()

# ---------- ICS ----------
ics_lines = [
"BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Google Inc//Google Calendar 70.9054//EN","X-WR-CALNAME:週末のよてい",
"BEGIN:VEVENT","DTSTART;TZID=Asia/Tokyo:20261121T090000","DTEND;TZID=Asia/Tokyo:20261121T100000","SUMMARY:朝のさんぽ","LOCATION:公園\\, 東口","DESCRIPTION:ゆっくり歩く\\n水を持っていく","BEGIN:VALARM","TRIGGER:-PT10M","ACTION:DISPLAY","DESCRIPTION:Reminder","END:VALARM","END:VEVENT",
"BEGIN:VEVENT","DTSTART:20261121T030000Z","DTEND:20261121T040000Z","SUMMARY:UTCの予定","END:VEVENT",
"BEGIN:VEVENT","DTSTART;VALUE=DATE:20261121","SUMMARY:終日のイベント","END:VEVENT",
"BEGIN:VEVENT","DTSTART;TZID=Asia/Tokyo:20261121T150000","DTEND;TZID=Asia/Tokyo:20261121T160000","SUMMARY:中止になった予定","STATUS:CANCELLED","END:VEVENT",
"BEGIN:VEVENT","DTSTART;TZID=Asia/Tokyo:20261122T100000","DTEND;TZID=Asia/Tokyo:20261122T110000","SUMMARY:二日目のランチ","RRULE:FREQ=WEEKLY","END:VEVENT",
"BEGIN:VEVENT","DTSTART;TZID=Asia/Tokyo:20261122T130000","SUMMARY:とても長い予定の名前をつけて折り返しを確かめる、あいうえおかきくけこさしすせそたちつてとなにぬねの","END:VEVENT",
"END:VCALENDAR"]
def fold(line):
    out=[]; cur=b""
    for ch in line:
        b=ch.encode("utf-8")
        if len(cur)+len(b)>70: out.append(cur.decode("utf-8")); cur=b" "+b
        else: cur+=b
    out.append(cur.decode("utf-8")); return "\r\n".join(out)
w("google_like.ics", ("\r\n".join(fold(l) for l in ics_lines) + "\r\n").encode("utf-8"))

# ---------- HTML ----------
html = """<!doctype html><html><head><meta charset="utf-8"><title>旅行メモ</title><script>alert('x')</script></head><body>
<h1>旅行メモ</h1><h2>1日目</h2>
<table><caption>1日目の予定</caption><tr><th>時刻</th><th>内容</th><th>待ち</th><th>費用</th></tr>
<tr><td>9:00</td><td>ホテル出発</td><td></td><td></td></tr>
<tr><td>10:00–11:00</td><td>水族館</td><td>20分</td><td>¥2,000</td></tr></table>
<h2>2日目</h2>
<table><tr><th>開始</th><th>終了</th><th>内容</th></tr><tr><td>9:30</td><td>10:00</td><td>朝食</td></tr><tr><td>11:00</td><td>12:00</td><td>お買い物</td></tr></table>
<table><tr><td>広告</td><td>バナー</td></tr></table>
<script src="http://evil.example/x.js"></script></body></html>"""
w("two_tables.html", html.encode("utf-8"))
w("sheets_like.html", """<html><body><table class="waffle"><thead><tr><th></th><th>A</th><th>B</th><th>C</th></tr></thead><tbody>
<tr><th>1</th><td>開始</td><td>内容</td><td>備考</td></tr><tr><th>2</th><td>9:00</td><td>集合</td><td>駅</td></tr><tr><th>3</th><td>10:00</td><td>散歩</td><td></td></tr></tbody></table></body></html>""".encode("utf-8"))

# ---------- Markdown ----------
md = """# 週末の予定

## 土曜日

| 時刻 | 内容 | 待ち | 費用 |
|---|---|---|---|
| 9:00 | **朝食** | | |
| 10:00 | [水族館](http://example.com) | 20分 | ¥2,000 |

## 日曜日

- 9:30 朝ごはん
- 11:00 買い物 待ち15分
- [ ] 13:00 帰り
"""
w("two_sections.md", md.encode("utf-8"))
w("list_only.md", "- 9:00 集合\n- 10:00 出発\n- 12:00 ランチ ¥1,200\n".encode("utf-8"))

# ---------- CSV / TSV ----------
csv_text = "開始,終了,内容,備考\r\n9:00,9:45,\"カフェ, 朝\",\"1行目\n2行目\"\r\n10:00,11:00,散歩,\r\n"
w("utf8_bom.csv", b"\xef\xbb\xbf" + csv_text.encode("utf-8"))
w("sjis.csv", csv_text.encode("cp932"))
w("semicolon.csv", "時刻;内容;待ち\n9:00;集合;5分\n10:00;出発;\n".encode("utf-8"))
w("headerless.csv", "9:00,集合,駅\n10:00,出発,バス\n".encode("utf-8"))
w("formula_guard.csv", ("状態,開始(予定),終了(予定),内容,種類,予想待ち(分),実際待ち(分),実際の開始,実際の終了,費用(円),備考,ひとことメモ,★\r\n完了,09:00,09:45,'=危ない名前,体験,35,40,09:05,09:50,1200,'-備考,'@メモ,3\r\n").encode("utf-8"))
tsv = "開始\t終了\t内容\t待ち\n9:00\t9:30\t集合\t\n10:00\t10:45\tアトラクション\t30分\n"
w("plain.tsv", tsv.encode("utf-8"))
w("utf16.tsv", b"\xff\xfe" + tsv.encode("utf-16-le"))

# ---------- TXT ----------
w("memo1.txt", "【11/21 午前】\n9:00 集合 駅\n10:00 アトラクションA 待ち30分\n".encode("utf-8"))
w("memo2.txt", "【11/21 午後】\n13:00 ランチ ¥1,500\n15:00 お土産 ¥800\n17:00 帰る\n".encode("utf-8"))
w("memo3.txt", "11:00 〜 12:00 散歩\n12:30 おやつ\n".encode("utf-8"))
w("sections.txt", "【1日目】\n9:00 出発\n12:00 ランチ\n【2日目】\n10:00 観光\n15:00 帰宅\n".encode("utf-8"))
w("memo_sjis.txt", "9:00 集合\n10:00 出発\n".encode("cp932"))

# ---------- JSON ----------
w("foreign_array.json", json.dumps([{"name":"Breakfast","start":"09:00","end":"09:30","cost":600},{"name":"Museum","start":"10:00","end":"12:00","memo":"チケット","wait":"25"}], ensure_ascii=False).encode("utf-8"))
w("multi_plans.json", json.dumps({"plans":[{"title":"A案","date":"2026-11-21","items":[{"n":"朝食","s":"08:00"},{"n":"散歩","s":"09:00"}]},{"title":"B案","date":"2026-11-22","items":[{"n":"昼食","s":"12:00"}]}]}, ensure_ascii=False).encode("utf-8"))
w("broken.json", b'{"plan": {"items": [')

# ---------- エラー用 ----------
w("empty.txt", b"")
w("legacy.xls", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\0"*600)
w("encrypted_like.docx", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\0"*600)
buf = io.BytesIO()
with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z: z.writestr("hello.txt", "hi")
w("random.zip", buf.getvalue())
w("truncated.xlsx", open(os.path.join(FX,"multi_openpyxl.xlsx"),"rb").read()[:700])
buf = io.BytesIO()
with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z: z.writestr("xl/workbook.xml", b"0"*(40*1024*1024))
w("bomb.xlsx", buf.getvalue())
w("big.txt", (("9:00 あ\n")*200000).encode("utf-8"))
w("renamed_xlsx.txt", open(os.path.join(FX,"single_text_times.xlsx"),"rb").read())
print(sorted(os.listdir(FX)))
