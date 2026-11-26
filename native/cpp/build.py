#!/usr/bin/env python3
# C++ → WebAssembly のビルド。出力：ルートの are-fast.wasm（チャットが読みこむ）
#   python3 native/cpp/build.py          作る
#   python3 native/cpp/build.py --check  いまの are-fast.wasm が、are_fast.cpp から作った結果と同じかを調べる
# 必要なもの：clang（wasm32 に対応したもの）と wasm-ld。Emscripten は不要です。
import os, subprocess, sys, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(HERE, "are_fast.cpp")
OUT = os.path.join(ROOT, "are-fast.wasm")
def build(out):
    clang = shutil.which("clang") or shutil.which("clang-18") or shutil.which("clang-17")
    if not clang:
        print("clang が見つかりません。"); sys.exit(2)
    cmd = [clang, "--target=wasm32", "-O3", "-nostdlib", "-fno-exceptions", "-fno-rtti", "-ffreestanding", "-fno-builtin",
           "-Wl,--no-entry", "-Wl,--export-dynamic", "-Wl,--export=__heap_base", "-Wl,--initial-memory=1048576", "-Wl,--max-memory=1073741824", "-Wl,--strip-all",
           "-Wl,-z,stack-size=65536", "-o", out, SRC]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-3000:]); sys.exit(1)
if __name__ == "__main__":
    if "--check" in sys.argv:
        tmp = OUT + ".tmp"; build(tmp)
        same = os.path.exists(OUT) and open(OUT, "rb").read() == open(tmp, "rb").read()
        os.remove(tmp)
        print("are-fast.wasm は最新です。" if same else "are-fast.wasm が、are_fast.cpp から作った結果と違います。 python3 native/cpp/build.py を実行してください。")
        sys.exit(0 if same else 1)
    build(OUT); print("are-fast.wasm を作りました（%d バイト）。" % os.path.getsize(OUT))
