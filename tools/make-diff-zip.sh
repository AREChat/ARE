#!/bin/sh
# 変更したファイルだけを zip にする（使い方: sh tools/make-diff-zip.sh 出力名.zip）
# git があるフォルダで、最後のコミットからの変更分を zip にします。
OUT="${1:-changed.zip}"
{ git diff --name-only HEAD; git ls-files --others --exclude-standard; } | sort -u | zip -@ "$OUT"
echo "作成: $OUT"
