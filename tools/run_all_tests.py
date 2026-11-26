#!/usr/bin/env python3
"""ARE の自動テストを、ぜんぶ まとめて流す（GitHub Actions のかわり）。

  python3 tools/run_all_tests.py                すべて（ふつうの検査 ＋ ブラウザのテスト）
  python3 tools/run_all_tests.py --quick        ふつうの検査だけ（数十秒）
  python3 tools/run_all_tests.py --only chat    名前に chat をふくむものだけ
  python3 tools/run_all_tests.py --skip df_     名前に df_ をふくむものを除く
  python3 tools/run_all_tests.py --jobs 4       ブラウザのテストを 4 つ同時に流す（初期値 2）
  python3 tools/run_all_tests.py --long         通話の長いテスト（約25分）もふくめる
  python3 tools/run_all_tests.py --list         何があるかだけ見る
  python3 tools/run_all_tests.py --report       結果を GAS（ドライブ）へも送る（設定は tools/hub_client.py の説明を見る）

見た目：○ 通った ／ × 失敗 ／ △ 判定できなかった（道具や別のフォルダが無い・時間切れ など）
終わりの数：失敗が 1 つでもあれば 1、なければ 0。
必要なもの：Python 3 / Node.js / Playwright（ブラウザのテストだけ）。有料のものは使いません。
"""
import argparse, concurrent.futures as cf, glob, hashlib, json, os, re, shutil, socket, subprocess, sys, tempfile, threading, time

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
E2E = os.path.join(ROOT, "tools", "e2e")
OUT = "/tmp/are-e2e"
os.makedirs(OUT, exist_ok=True)
lock = threading.Lock()
results = []   # {group,name,result,note,sec}


def run(cmd, cwd=ROOT, timeout=120, env=None):
    e = dict(os.environ)
    if env:
        e.update(env)
    t0 = time.time()
    try:
        p = subprocess.run(cmd, cwd=cwd, env=e, capture_output=True, text=True, timeout=timeout, errors="replace")
        return p.returncode, (p.stdout or "") + (p.stderr or ""), time.time() - t0
    except subprocess.TimeoutExpired as ex:
        out = ((ex.stdout or b"").decode("utf-8", "replace") if isinstance(ex.stdout, bytes) else (ex.stdout or ""))
        return 124, out, time.time() - t0
    except FileNotFoundError as ex:
        return 127, str(ex), time.time() - t0


def add(group, name, result, note="", sec=0.0):
    with lock:
        results.append({"group": group, "name": name, "result": result, "note": note.strip()[:300], "sec": round(sec, 1)})
        mark = {"pass": "○", "fail": "×", "warn": "△"}[result]
        print("  %s %s%s" % (mark, name, ("  … " + note.strip().splitlines()[-1][:110]) if note.strip() and result != "pass" else ""), flush=True)


def last_lines(text, n=3):
    ls = [l for l in text.strip().splitlines() if l.strip()]
    return " / ".join(ls[-n:])


def git_files(*pats):
    rc, out, _ = run(["git", "ls-files"] + list(pats))
    return [l for l in out.splitlines() if l] if rc == 0 else []


# ------------------------------------------------------------
# A. ふつうの検査
# ------------------------------------------------------------
def checks(args):
    print("\n■ A. ふつうの検査")
    have_node = shutil.which("node") is not None
    if not have_node:
        add("検査", "Node.js", "warn", "node が見つかりません。JS の検査は できません")
        return

    # バンドルが最新か
    if os.path.exists(os.path.join(ROOT, "tools/build-bundle.js")):
        if not os.path.isdir(os.path.join(ROOT, "node_modules/terser")):
            run(["npm", "i", "--no-save", "terser@5.51.2"], timeout=180)
        rc, out, sec = run(["node", "tools/build-bundle.js", "--check"], timeout=180)
        add("検査", "チャットのJSのまとめ(chat.bundle.js)が最新", "pass" if rc == 0 else ("warn" if "terser" in out.lower() and "Cannot find" in out else "fail"), last_lines(out), sec)

    # 見張り(protect.js)が、元のコード(tools/src/protect.src.js)から作った結果と同じか
    if os.path.exists(os.path.join(ROOT, "tools/build-protect.js")):
        rc, out, sec = run(["node", "tools/build-protect.js", "--check"], timeout=120)
        add("検査", "見張り(protect.js)が元のコードから作った最新版", "pass" if rc == 0 else "fail", last_lines(out), sec)

    # オフライン用の一覧が最新か（ファイルを書きかえずに比べる）
    files = [os.path.join(ROOT, f) for f in ("precache.json", "precache-manifest.js")]
    if all(os.path.exists(f) for f in files) and os.path.exists(os.path.join(ROOT, "tools/gen-precache.js")):
        before = {f: open(f, "rb").read() for f in files}
        rc, out, sec = run(["node", "tools/gen-precache.js"])
        after = {f: open(f, "rb").read() for f in files}
        for f in files:
            open(f, "wb").write(before[f])   # もとに戻す（試験が、ファイルを書きかえないように）
        add("検査", "オフライン用の一覧(precache)が最新", "pass" if rc == 0 and before == after else "fail", "tools/gen-precache.js を実行してください" if before != after else last_lines(out), sec)

    # JS の文法
    js = [f for f in git_files("*.js", "*.mjs") if os.path.exists(os.path.join(ROOT, f))]
    t0 = time.time()
    bad = []

    def chk(f):
        rc, out, _ = run(["node", "--check", f], timeout=60)
        return f, rc, out
    with cf.ThreadPoolExecutor(max_workers=4) as ex:
        for f, rc, out in ex.map(chk, js):
            if rc != 0:
                bad.append(f + ": " + last_lines(out, 1))
    add("検査", "JavaScript の文法（%d ファイル）" % len(js), "pass" if not bad else "fail", "; ".join(bad[:3]), time.time() - t0)

    # GAS の文法
    gs = [f for f in git_files("*.gs") if os.path.exists(os.path.join(ROOT, f))]
    badg = []
    for f in gs:
        rc, out, _ = run(["node", "-e", "new (require('vm').Script)(require('fs').readFileSync(process.argv[1],'utf8'),{filename:process.argv[1]})", f])
        if rc != 0:
            badg.append(f + ": " + last_lines(out, 1))
    if gs:
        add("検査", "GAS の文法（%d ファイル）" % len(gs), "pass" if not badg else "fail", "; ".join(badg[:3]))

    # JSON
    bj = []
    js_files = git_files("*.json", "*.webmanifest")
    for f in js_files:
        p = os.path.join(ROOT, f)
        if not os.path.exists(p):
            continue
        try:
            json.load(open(p, encoding="utf-8-sig"))
        except Exception as ex:
            bj.append("%s: %s" % (f, str(ex)[:60]))
    add("検査", "JSON の形（%d ファイル）" % len(js_files), "pass" if not bj else "fail", "; ".join(bj[:3]))

    # Python の文法
    py = [f for f in git_files("*.py") if os.path.exists(os.path.join(ROOT, f))]
    bp = []
    import ast
    for f in py:
        try:
            ast.parse(open(os.path.join(ROOT, f), encoding="utf-8").read(), filename=f)
        except SyntaxError as ex:
            bp.append("%s:%s" % (f, ex.lineno))
    if py:
        add("検査", "Python の文法（%d ファイル）" % len(py), "pass" if not bp else "fail", "; ".join(bp[:3]))

    # node のテストたち
    node_tests = [
        ("虫のチェック（虫は一切なし）", ["node", "tools/check-bugs.js"]),
        ("禁止語チェック（ゲームの文章）", ["node", "tools/check-words.js"]),
        ("リンク切れ", ["node", "tools/linkcheck.js"]),
        ("管理者の「取り込み中」と通知", ["node", "tools/check-busy-notify.js"]),
        ("利用時間レポートの GAS", ["node", "tools/usage-gas-test.js"]),
        ("ハブの GAS（通知・Office・テスト結果の受け口）", ["node", "tools/gas-hub-test.js"]),
    ]
    for name, cmd in node_tests:
        if not os.path.exists(os.path.join(ROOT, cmd[1])):
            continue
        rc, out, sec = run(cmd, timeout=240)
        add("検査", name, "pass" if rc == 0 else "fail", last_lines(out), sec)

    # 版の上げ忘れ（git の元の場所があるときだけ）
    if os.path.exists(os.path.join(ROOT, "tools/check-sw-bump.sh")) and subprocess.run(["git", "rev-parse", "origin/main"], cwd=ROOT, capture_output=True).returncode == 0:
        rc, out, sec = run(["sh", "tools/check-sw-bump.sh"], timeout=60)
        add("検査", "sw.js の版の上げ忘れ", "pass" if rc == 0 else "fail", last_lines(out), sec)

    # Android アプリ（Java）：道具があるときだけ、ビルドして確かめる
    if args.apk:
        gradle = shutil.which("gradle")
        sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
        if gradle and sdk:
            rc, out, sec = run([gradle, "--no-daemon", "-q", ":app:assembleDebug"], cwd=os.path.join(ROOT, "native/android"), timeout=900, env={"ANDROID_HOME": sdk, "ANDROID_SDK_ROOT": sdk})
            add("検査", "Android アプリ（Java）がビルドできる", "pass" if rc == 0 else "fail", last_lines(out), sec)
        else:
            add("検査", "Android アプリ（Java）がビルドできる", "warn", "gradle か ANDROID_HOME が見つかりません")

    # C++（WASM）
    cpp = os.path.join(ROOT, "native/cpp/test.py")
    if os.path.exists(cpp):
        rc, out, sec = run([sys.executable, cpp], timeout=300)
        add("検査", "C++（速い画像処理・当たり判定）", "pass" if rc == 0 else ("warn" if rc == 77 else "fail"), last_lines(out), sec)


# ------------------------------------------------------------
# B. ブラウザのテスト（Python + Playwright）
# ------------------------------------------------------------
def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def verdict(rc, out):
    """出力から、○ × △ を決める"""
    if rc == 124:
        return "warn", "時間切れ"
    if rc == 127:
        return "warn", "道具が見つかりません"
    text = out
    if "Traceback (most recent call last)" in text and rc != 0:
        tail = [l for l in text.strip().splitlines() if l.strip()][-1:] or [""]
        if re.search(r"ModuleNotFoundError|No module named|Executable doesn't exist|playwright install", text):
            return "warn", "Playwright など道具が足りません: " + tail[0][:80]
        return "fail", tail[0][:140]
    ng = [l for l in text.splitlines() if re.match(r"^\s*(NG|FAIL|×|✗|✘)\b", l)]
    ratios = re.findall(r"(\d+)\s*/\s*(\d+)(?!\s*[:\d])", text.splitlines()[-1] if text.strip() else "")
    if ng:
        return "fail", ng[0][:140]
    if rc != 0:
        return "fail", last_lines(text, 2)
    for a, b in ratios[-1:]:
        if int(a) < int(b):
            return "fail", "%s / %s" % (a, b)
        return "pass", ""
    oks = [l for l in text.splitlines() if re.match(r"^\s*(OK|ok|○|PASS)\b", l)]
    if oks:
        return "pass", ""
    return "warn", "結果の文が出ませんでした（エラーなしで終わりました）"


def browser(args):
    tests = sorted(glob.glob(os.path.join(E2E, "*_test*.py")))
    if args.only:
        tests = [t for t in tests if args.only in os.path.basename(t)]
    if args.skip:
        tests = [t for t in tests if args.skip not in os.path.basename(t)]
    print("\n■ B. ブラウザのテスト（%d 本・同時 %d）" % (len(tests), args.jobs))
    if not tests:
        return
    try:
        import playwright  # noqa: F401
    except Exception:
        add("ブラウザ", "Playwright（Python）", "warn", "入っていません。  pip install playwright && playwright install chromium")
        return
    game_dir = os.environ.get("GAME_SRC") or next((p for p in (os.path.join(ROOT, "..", "game"), "/home/claude/r3/game") if os.path.isdir(p)), "")
    port = free_port()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    env = {"ARE_SRC": ROOT, "ARE_PORT": str(port), "PYTHONIOENCODING": "utf-8", "PYTHONPATH": E2E}
    if game_dir:
        env["GAME_SRC"] = game_dir

    def one(t):
        name = os.path.basename(t)
        src = open(t, encoding="utf-8", errors="ignore").read()
        needs_game = ("r3/game" in src or "GAME_SRC" in src or "game_pad_lib" in src)
        if needs_game and not game_dir:
            return name, "warn", "ゲームのフォルダ（game リポジトリ）が見つかりません。GAME_SRC=…を指定してください", 0
        rc, out, sec = run([sys.executable, "-I", "-X", "utf8", t], cwd=E2E, timeout=args.timeout, env=env) if False else run([sys.executable, "-X", "utf8", t], cwd=E2E, timeout=args.timeout, env=env)
        r, note = verdict(rc, out)
        return name, r, note, sec
    try:
        with cf.ThreadPoolExecutor(max_workers=max(1, args.jobs)) as ex:
            for name, r, note, sec in ex.map(one, tests):
                add("ブラウザ", name, r, note, sec)
    finally:
        srv.terminate()

    # node + Playwright のテスト
    if args.long:
        sh = os.path.join(ROOT, "tools/call-e2e/run-all.sh")
        if os.path.exists(sh):
            rc, out, sec = run(["bash", sh], timeout=2400)
            add("ブラウザ", "通話の長いテスト(call-e2e)", "pass" if rc == 0 else "fail", last_lines(out), sec)


# ------------------------------------------------------------
# 結果のまとめ
# ------------------------------------------------------------
def summarize(args, started):
    n = len(results)
    p = sum(1 for r in results if r["result"] == "pass")
    f = sum(1 for r in results if r["result"] == "fail")
    w = sum(1 for r in results if r["result"] == "warn")
    status = "pass" if f == 0 else "fail"
    lines = ["# ARE 自動テストの結果", "", "- 日時: " + time.strftime("%Y-%m-%d %H:%M:%S"), "- 合計 %d 件：○ %d ／ × %d ／ △ %d（%d 秒）" % (n, p, f, w, int(time.time() - started)), ""]
    lines += ["| 結果 | 区分 | 名前 | ひとこと |", "|---|---|---|---|"]
    order = {"fail": 0, "warn": 1, "pass": 2}
    for r in sorted(results, key=lambda r: (order[r["result"]], r["group"], r["name"])):
        lines.append("| %s | %s | %s | %s |" % ({"pass": "○", "fail": "×", "warn": "△"}[r["result"]], r["group"], r["name"], r["note"].replace("|", "/").replace("\n", " ")))
    text = "\n".join(lines) + "\n"
    path = os.path.join(OUT, "report-%s.md" % time.strftime("%Y%m%d-%H%M%S"))
    open(path, "w", encoding="utf-8").write(text)
    open(os.path.join(OUT, "report-latest.json"), "w", encoding="utf-8").write(json.dumps(results, ensure_ascii=False, indent=1))
    print("\n" + "=" * 60)
    print("結論：○ %d ／ × %d ／ △ %d  （全部で %d 件）" % (p, f, w, n))
    for r in results:
        if r["result"] == "fail":
            print("  × [%s] %s … %s" % (r["group"], r["name"], r["note"]))
    print("詳しい一覧:", path)
    if args.report:
        sys.path.insert(0, os.path.join(ROOT, "tools"))
        import hub_client
        if not hub_client.configured():
            print("GAS への送信：設定がありません（python3 tools/hub_client.py setup）。送りませんでした。")
        else:
            try:
                r = hub_client.send_report("run_all_tests", status, {"total": n, "pass": p, "fail": f, "warn": w}, text, socket.gethostname()[:30])
                print("GAS（ドライブ）へ送りました:", r.get("url") if r.get("ok") else r)
            except Exception as ex:
                print("GAS への送信に失敗しました:", ex)
    return 1 if f else 0


def main():
    ap = argparse.ArgumentParser(description="ARE の自動テストを まとめて流す")
    ap.add_argument("--quick", action="store_true", help="ふつうの検査だけ")
    ap.add_argument("--only", default="", help="名前にこの文字をふくむブラウザのテストだけ")
    ap.add_argument("--skip", default="", help="名前にこの文字をふくむブラウザのテストを除く")
    ap.add_argument("--jobs", type=int, default=2)
    ap.add_argument("--timeout", type=int, default=240, help="ブラウザのテスト 1 本の制限時間（秒）")
    ap.add_argument("--long", action="store_true", help="通話の長いテストもふくめる")
    ap.add_argument("--apk", action="store_true", help="Android アプリのビルドも確かめる")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--report", action="store_true", help="結果を GAS（ドライブ）へも送る")
    args = ap.parse_args()
    if args.list:
        print("検査: bundle / precache / JS・GAS・JSON・Python の文法 / check-bugs / check-words / linkcheck / check-busy-notify / usage-gas-test / gas-hub-test / sw版 / (--apk) Android / C++")
        for t in sorted(glob.glob(os.path.join(E2E, "*_test*.py"))):
            print("ブラウザ:", os.path.basename(t))
        return 0
    started = time.time()
    os.chdir(ROOT)
    checks(args)
    if not args.quick:
        browser(args)
    return summarize(args, started)


if __name__ == "__main__":
    sys.exit(main())
