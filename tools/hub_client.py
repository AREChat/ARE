#!/usr/bin/env python3
"""Python から ARE の GAS（ハブ）へ送る小さな道具。GitHub Actions のかわりです。

使い方（コマンド）
  python3 tools/hub_client.py ping                    つながるか確かめる
  python3 tools/hub_client.py status                  最近のテスト結果の一覧を見る
  python3 tools/hub_client.py upload ファイル名        ファイル（アプリなど）をドライブに置いて、リンクを出す
  python3 tools/hub_client.py setup                   GAS の URL と合言葉を、このパソコンに保存する

設定の置き場所（秘密なので、GitHub には置きません）
  ・環境変数 ARE_HUB_URL / ARE_CI_SECRET
  ・または  ~/.are-hub.json   {"url": "https://script.google.com/macros/s/…/exec", "ci_secret": "…"}
無料の Python 標準部品だけで動きます（追加のインストールは いりません）。
"""
import base64, json, os, stat, sys, urllib.request, urllib.error

CONF_PATH = os.path.expanduser("~/.are-hub.json")


def load_conf():
    url = os.environ.get("ARE_HUB_URL", "").strip()
    sec = os.environ.get("ARE_CI_SECRET", "").strip()
    if (not url or not sec) and os.path.exists(CONF_PATH):
        try:
            c = json.load(open(CONF_PATH, encoding="utf-8"))
            url = url or str(c.get("url", "")).strip()
            sec = sec or str(c.get("ci_secret", "")).strip()
        except Exception:
            pass
    return url, sec


def configured():
    url, sec = load_conf()
    return bool(url.startswith("https://script.google.com/") and len(sec) >= 16)


def call(body, timeout=120):
    """GAS へ送って、返ってきた JSON を返す。GAS は、いったん別の住所へ案内するので、それも自動で追いかける"""
    url, _ = load_conf()
    if not url:
        raise RuntimeError("GAS の URL が設定されていません（python3 tools/hub_client.py setup）。")
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "text/plain;charset=utf-8"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            text = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        raise RuntimeError("GAS が %s を返しました" % e.code)
    try:
        return json.loads(text)
    except Exception:
        raise RuntimeError("GAS の返事が読めませんでした（URL が「ウェブアプリ」の /exec か確認してください）: " + text[:80])


def ci(op, **fields):
    _, sec = load_conf()
    if not sec:
        raise RuntimeError("CI_SECRET が設定されていません。")
    return call(dict(action="ci", op=op, secret=sec, **fields))


def send_report(name, status, summary, text, host=""):
    return ci("report", name=name, status=status, summary=summary, text=text, host=host)


def upload(path, mime="application/octet-stream"):
    with open(path, "rb") as f:
        raw = f.read()
    return ci("artifact", name=os.path.basename(path), mime=mime, b64=base64.b64encode(raw).decode("ascii"))


def status():
    url, _ = load_conf()
    req = urllib.request.Request(url + ("&" if "?" in url else "?") + "action=ci")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def main(argv):
    cmd = argv[1] if len(argv) > 1 else ""
    if cmd == "setup":
        url = input("GAS の URL（…/exec）: ").strip()
        sec = input("CI_SECRET（GAS の金庫に入れたものと同じ）: ").strip()
        with open(CONF_PATH, "w", encoding="utf-8") as f:
            json.dump({"url": url, "ci_secret": sec}, f)
        os.chmod(CONF_PATH, stat.S_IRUSR | stat.S_IWUSR)
        print("保存しました:", CONF_PATH, "（自分だけが読める設定にしました）")
    elif cmd == "ping":
        print(ci("ping"))
    elif cmd == "status":
        s = status()
        print("保管数:", s.get("count"))
        for x in s.get("list", [])[:10]:
            print(" ", x.get("name"), x.get("status"), x.get("summary"))
    elif cmd == "upload" and len(argv) > 2:
        r = upload(argv[2])
        print(r.get("download") or r)
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
