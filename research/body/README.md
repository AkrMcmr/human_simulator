# body track の研究データと手順

設計は [docs/body](../../docs/body/README.md)。ここには参照データの取得手順、導出スクリプト、protocol、集計結果を置く。生データ（CSV 本体）はコミットしない。

## ANSUR II（人体計測）

- 出典: 米陸軍 ANSUR II 公開ワーキングデータベース（2012）。無制限の公開が許可されたデータ。原配布は <https://www.openlab.psu.edu/ansur2/>。
- 取得（2026-11-06）: 原配布サイトがビルド環境から到達できなかったため、GitHub のミラー `senihberkay/US-Army-ANSUR-II` の `ANSUR II MALE Public.csv` / `ANSUR II FEMALE Public.csv` を使用。ファイルの SHA-256 は [protocol](protocols/morph-v1.json) の `data.sha256` に固定し、導出・評価スクリプトは一致しないファイルを拒否する。
- 形式: Latin-1、長さは mm、`weightkg` 列はヘクトグラム（10 で割って kg）。男性 4,082 名、女性 1,986 名、93 計測項目。
- 分割: `subjectid` が偶数を開発（回帰の推定）、奇数を確認（一度だけの新規確認）に使う。確認分割は一度見たら以後は回帰チェック。
- 限界: 軍人集団（年齢・体力の偏り）。一般集団や子どもへの外挿は主張しない。性別ごとに別の回帰。

### 回帰係数の再導出

```bash
node --experimental-strip-types research/body/scripts/derive-ansur2-regression.ts <male.csv> <female.csv>
```

`packages/body-anatomy/src/data/ansur2-regression.json` を書き出す。開発分割だけを使う。係数を変えたら `body-anatomy` の版を上げ、記録の `regressionHash` が変わる。

### 形態 T4（morph-v1）

```bash
npm run study:body-morph -- --male <male.csv> --female <female.csv> --split development --out outputs/body/morph-development.json
npm run study:body-morph -- --male <male.csv> --female <female.csv> --split validation --out outputs/body/morph-validation.json --check
```

protocol は [protocols/morph-v1.json](protocols/morph-v1.json)（閾値・対象体節・固定比率の対照を結果を見る前に固定）。結果は [results/](results/) に JSON と Markdown で保存する。

## 基準メッシュ（MakeHuman、CC0）

```bash
node --experimental-strip-types research/body/scripts/derive-base-mesh.ts <base.obj>
```

MakeHuman リポジトリの `makehuman/data/3dobjs/base.obj` から皮膚と関節ヘルパー重心を取り出し、`assets/body/base-mesh/makehuman-base.json` を書き出す。出典・ライセンス・ハッシュは [assets/body/base-mesh/README.md](../../assets/body/base-mesh/README.md)。

## 他の参照データ（未着手）

- 体節慣性: de Leva (1996)、Dumas (2007) の表との比較（運動 T4）。
- 歩行: 公開歩行データセットとの比較（B2）。
- 可動域: 複数の正常値表の照合。
