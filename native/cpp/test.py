#!/usr/bin/env python3
# C++（WASM）の検査：①がビルドできる／いまの are-fast.wasm が最新 ②JS の元の計算と同じ結果・当たり判定が総当たりと同じ・速さ
# 終了コード：0=すべて○ 1=×あり 77=clang などが無く、確かめられない（△）
import os, subprocess, sys, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
if not (shutil.which("clang") or shutil.which("clang-18") or shutil.which("clang-17")):
    print("clang が見つからないので、C++ のビルドは確かめられません（are-fast.wasm の動きだけ確かめます）")
    have_clang = False
else:
    have_clang = True
if have_clang:
    r = subprocess.run([sys.executable, os.path.join(HERE, "build.py"), "--check"], capture_output=True, text=True)
    print(r.stdout.strip() or r.stderr.strip())
    if r.returncode != 0: sys.exit(1)
if not shutil.which("node"):
    print("node が見つかりません"); sys.exit(77)
r = subprocess.run(["node", os.path.join(HERE, "test.js")], capture_output=True, text=True)
print(r.stdout.strip()); 
if r.stderr.strip(): print(r.stderr.strip()[-500:])
sys.exit(0 if r.returncode == 0 else 1)
