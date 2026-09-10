# 実行・検証ガイド

ルートディレクトリから実行します。Node.js 24.19.0で検証済みです。`.npmrc`とロックファイルを維持し、通常は`npm ci`を使います。

## 変更別の検証

| 対象 | 必要な確認 |
| --- | --- |
| 文書のみ | リンク、実際のAPI/コマンドとの一致。原則としてモデル再実行は不要 |
| human/world/simulation | `npm run test:model`、`npm run typecheck`、該当する複数シード比較 |
| 評価器・CLI | `npm run test:evaluation`、`npm run typecheck`、基準版と負の対照の検出 |
| 予測政策の候補 | `npm run test:policy`、`npm run study:policy -- --split development`。候補を固定後にvalidation |
| UI | `npm run typecheck`、`npm run build`、`node --test tests/*.test.mjs`。ブラウザQAは明示的に依頼された範囲 |

`test:model`は`tests/model/*.test.ts`なのでpolicyのテストも含みます。`test:policy`はその絞り込みです。`npm test`はスターター由来のビルド＋画面側テストであり、モデル・評価器のテストすべてを実行するコマンドではありません。

## 基準版との比較

```bash
npm run evaluate -- --baseline research/baselines/v0.1.0-core-v1.json --out outputs/core-comparison.json --check
npm run study:policy -- --split development --out outputs/policy-development.json
npm run study:policy -- --split validation --out outputs/policy-validation.json --check
```

`evaluate --check`は工学的基準未達や許容幅を超える悪化で終了コード1です。通常実行は未達でもレポートを保存します。policy studyも同様で、core-v1の副作用と候補寄与無効の一致を確認します。JSONと同名のMarkdownを出力します。

最初の基準評価器は、CLIと`packages/evaluation/src`のファイル一式をハッシュ化します。評価器のコメントや補助ファイルの追加でも不一致になる場合があります。不一致チェックを外さず、両モデルを同じ評価器で測り直します。モデルの比較には世界・知覚契約・乱数生成器も同一にします。

## エラーの読み方

- **Evaluator changed**: 評価の計算や入口が違う。旧版と候補を同じ評価器で再評価する。
- **Environment or RNG changed**: 世界や知覚や乱数が違う。人間モデルの差だけを調べるなら同じ環境へそろえる。
- **Summary does not match measurements**: 保存値と集計が一致しない。手で結果を書き換えず、元の条件から再計算する。
- **同じ初期条件から記録を再現できない**: シミュレーション記録の版、ファイル、計算環境を確認する。評価JSONはシミュレーション再生用JSONと別形式。
- **No module / JSON import / strip-typesの問題**: Nodeの版と実行場所を確認する。TypeScriptをビルドしたJavaScriptと混在させない。
- **ビルドでtimeoutが見つからない**: スターターのビルドスクリプトはGNU timeoutを使用する。Linux/WSL等を使うか、MacではGNU coreutilsのtimeoutをPATHに用意する。モデルのCLI実験自体には不要。

## 再現と保存

同じ版・入力・seedで計算を再現します。異なるOS/JSエンジン間のビット単位一致は未検証です。GitHubの基準測定値とローカル実行でソースコミットIDが違っても、比較にはモデル・評価器・環境のハッシュと条件を確認します。文書だけの変更でコミットIDは変わります。

`outputs/`は作業用でGit対象外です。研究として採用するコンパクトな測定値は`research/baselines`、対照は`research/controls`、個別研究結果は`research/results`へ保存し、判断記録からリンクします。全フレームや個人データを通常のコミットへ大量に含めないでください。

確認用シードの結果を一度見たら、次回からは既知の回帰チェックです。`validation`という名前だけで未使用データだとは言えません。
