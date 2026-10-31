// ===== 設定（ここだけ見れば どこに何を読みにいくか わかる）=====
export const DF = {
    version: "0.1.0",
    // 公式 Three.js の バージョン（vendor/three/MANIFEST.json と そろえる）
    threeVersion: "0.160.0",
    // 1番めに読む：このゲームに同梱した公式ファイル（js/ からの相対パス）
    local: "../vendor/three/build/three.module.js",
    // 2番め（明示的に ?three=cdn を つけた時だけ）：公式を配信している CDN
    cdn: "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    saveKey: "dreamFrontier_v1"
};
