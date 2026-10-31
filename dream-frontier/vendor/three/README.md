# vendor/three/ — 公式 Three.js を おく場所

このフォルダには **Three.js の 公式ファイル**（MIT ライセンス）を おきます。
このリポジトリを 作った環境では インターネットに つながらなかったため、**ファイルは 同梱されていません**（にせものを 作ることは しません）。

## 取得方法（どちらか）

1. **自分の PC で 取得して コミットする**（かんたん・確実）
   ```
   node tools/fetch-three.mjs
   ```
   `npm pack three@<js/config.js の threeVersion>` で 公式 tarball を 取得し、**レジストリが 公表している ハッシュと 照合**してから
   `build/three.module.js` と `LICENSE` を ここへ コピーし、`MANIFEST.json` に 記録します。できた 3ファイルを コミットしてください。
2. **GitHub Actions に まかせる**（`.github/workflows/pages.yml`）
   Pages の Source を「GitHub Actions」にすると、公開の たびに 自動で 取得します。

## 手で おく場合
https://www.npmjs.com/package/three の 該当バージョンの tarball から `package/build/three.module.js` と `package/LICENSE` を
`vendor/three/build/three.module.js`・`vendor/three/LICENSE` に おきます。バージョンは `js/config.js` の `threeVersion`（現在 0.160.0）と そろえてください。
**ファイルの 中身は 書きかえないでください。**

## 置かれていない時は？
ゲームは **自動で 自作 WebGL2 版**に きりかわり、そのまま あそべます（見た目は ほぼ 同じ）。
くわしい 理由は 画面の「しんだん」（またはURLに `?diag=1`）で 見られます。
