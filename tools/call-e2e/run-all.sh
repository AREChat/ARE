#!/usr/bin/env bash
# 通話のテストを t1〜t6 すべて順に実行（合計 約25分）。MIN=1 で圧縮版。
cd "$(dirname "$0")" || exit 1
export NODE_PATH="$(npm root -g)"
fail=0
for t in t1 t2 t3 t4 t5 t6; do
  echo "=== $t"; timeout 590 node $t.js 2>&1 | grep -v "^ok" | tail -15 || true
  [ "${PIPESTATUS[0]}" = "0" ] || fail=1
done
exit $fail
