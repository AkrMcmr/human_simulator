# 基準メッシュ（base mesh）

`makehuman-base.json` は MakeHuman プロジェクトの基準メッシュ `makehuman/data/3dobjs/base.obj` から、皮膚（`body` グループ、13,380 頂点・26,756 三角形）と関節ヘルパーの重心（125 点）だけを取り出し、デシメートルをメートルに変換した派生物です。導出は [`research/body/scripts/derive-base-mesh.ts`](../../../research/body/scripts/derive-base-mesh.ts) で再現できます。

- 出典: <https://github.com/makehumancommunity/makehuman>（`master`、2026-11-08 取得）。元ファイルの SHA-256 は JSON の `source.sha256` に記録。
- ライセンス: MakeHuman の資産（基準メッシュを含む）は **CC0 1.0 Universal**。根拠は同梱の [`MAKEHUMAN-LICENSE.md`](MAKEHUMAN-LICENSE.md) の C 節（MakeHuman リポジトリの `LICENSE.md` の写し）。プログラム本体（AGPL）は含めていない。
- 含めていないもの: UV、テクスチャ、ヘルパー形状（衣服・髪・眼球・歯・舌・性器のヘルパー）、ターゲット（体型モーフ）。
- 用途: `packages/body-surface/src/fit.ts` が骨格に合わせて体節ごとに変形し、周径を回帰の目標値に合わせる。体表形状そのものの実測比較はまだない（[FIDELITY](../../../docs/body/FIDELITY.md)）。
