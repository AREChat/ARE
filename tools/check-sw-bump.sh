#!/bin/sh
# sw.js の版を 上げ忘れていないか(T421)。ゲームの中身が 変わったのに game/sw.js が 同じなら 失敗。
BASE="${1:-origin/main}"
git fetch -q origin main 2>/dev/null
CH=$(git diff --name-only "$BASE"...HEAD 2>/dev/null)
echo "$CH" | grep -q '^game/.*\.\(js\|css\|html\)$' && ! echo "$CH" | grep -q '^game/sw.js$' && { echo "game/ を 変えたのに game/sw.js の版が そのままです"; exit 1; }
echo "$CH" | grep -q '^\(chat.*\.js\|chat.html\|chat.css\)$' && ! echo "$CH" | grep -q '^sw.js$' && { echo "チャットを 変えたのに sw.js の版が そのままです"; exit 1; }
echo OK
