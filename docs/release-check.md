# リリース前チェック（T487）
- [ ] `node tools/check-words.js` / `linkcheck.js` / `smoke.js` が OK
- [ ] チャットの JS を直したときは `node tools/build-bundle.js --check` が OK（直したあと `build-bundle.js` を実行した）
- [ ] `node tools/gen-precache.js` で precache を作り直し、`sw.js` の版を上げた（`bash tools/check-sw-bump.sh`）
- [ ] 開発用DBで試してから 本番DB（SQLがあるとき）
- [ ] 主要画面を 1端末で 触った（`docs/qa-device-checklist.md`）
- [ ] `changelog.html` に 追記した（利用者に見える変更だけ）
- [ ] SQL・Edge Function を足したときは、開発用で試してから本番へ適用し、`docs/sql-apply.md` のとおり記録した
