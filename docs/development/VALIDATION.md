# 実行・検証ガイド

ルートディレクトリから実行します。Node.js 24.19.0で検証済みです。`.npmrc`とロックファイルを維持し、通常は`npm ci`を使います。

## 変更別の検証

| 対象 | 必要な確認 |
| --- | --- |
| 文書のみ | リンク、実際のAPI/コマンドとの一致。原則としてモデル再実行は不要 |
| human/world/simulation | `npm run test:model`、`npm run typecheck`、該当する複数シード比較 |
| 評価器・CLI | `npm run test:evaluation`、`npm run typecheck`、基準版と負の対照の検出 |
| 予測政策の候補（制御課題） | `npm run test:policy`、`npm run study:policy -- --split development`。候補を固定後にvalidation |
| 候補の通常world比較 | `npm run study:world -- --split development`。protocolをコミットしてから実行し、validationは一度だけ新規確認として扱う |
| モデル登録簿・選択 | `npm run test:model`（`tests/model/selection.test.ts`）、`npm run typecheck`。UIの選択肢も登録簿から生成 |
| 履歴介入の現象確認 | `npm run study:history -- --split development`。パイロットは`--split pilot`で尺度確認のみ。既定モデルの現象確認で候補比較ではない |
| 反応の途中変化・忘却 | `npm run study:reversal -- --split development`。`--model`と`--baseline-model`で対比較。改訂サイクルでは`study: "reversal-v1"`として実行 |
| 自由worldの最小合図 | `npm run study:signal-world -- --split development --model ID ...`。5モデル×2群で1分弱。`--check`は全モデルの成立で終了0 |
| 情報の非対称がある採餌 | `npm run study:referential -- --protocol v1\|v2\|v3 --round N --split development --model ID ...`。v3は食料が移り変わる世界（世界0.3.0）で4モデル×2群で各4分程度。`--check`はいずれかのモデルの成立で終了0 |
| UI | `npm run typecheck`、`npm run build`、`node --test tests/*.test.mjs`。ブラウザQAは明示的に依頼された範囲 |

`test:model`は`tests/model/*.test.ts`なのでpolicyのテストも含みます。`test:policy`はその絞り込みです。`npm test`はスターター由来のビルド＋画面側テストであり、モデル・評価器のテストすべてを実行するコマンドではありません。

## 基準版との比較

```bash
npm run evaluate -- --baseline research/baselines/v0.2.0-core-v1.json --out outputs/core-comparison.json --check
npm run study:policy -- --split development --out outputs/policy-development.json
npm run study:policy -- --split validation --out outputs/policy-validation.json --check
npm run study:world -- --split development --out outputs/world-development.json
npm run study:world -- --split validation --out outputs/world-validation.json --check
npm run experiment -- --seed 42 --steps 600 --model human-0.1.0 --out outputs/legacy-run.json
npm run study:history -- --split validation --out outputs/history-validation.json --check
npm run study:reversal -- --split validation --out outputs/reversal-validation.json --check
npm run study:reversal -- --split development --model forgetting-keep-estimate-0.3.0-experimental.1 --baseline-model human-0.2.0 --out outputs/reversal-candidate.json
```

`evaluate --check`は工学的基準未達や許容幅を超える悪化で終了コード1です。通常実行は未達でもレポートを保存します。policy study・world studyも同様で、core-v1の副作用と候補寄与無効の一致を確認します。world studyは8条件×8シード×3版で1分前後かかり、条件別の表も出力します。JSONと同名のMarkdownを出力します。保存済みの結果は`research/results/world-v1-*.json`（改行なしの圧縮JSON）です。

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

## 改訂サイクル

`npm run test:evolution`は登録順序、固定後の変更拒否、回帰判定、再実行、証拠の保持、world-v1評価器の接続を検証します。engineやCLI変更時は型チェックと合わせて実行してください。モデルの実装を変更した場合には従来のモデルテストも必要です。

specの`study`で評価器を選びます。省略か`core-v1`なら基礎能力10項目、`world-v1`なら通常worldの8条件比較、`reversal-v1`なら反応の途中変化と忘却の対比較を主要基準に使い、core-v1の回帰も常に確認します。`regressionStudies: ["world-v1"]`を付けると、world-v1の副作用項目と寄与無効の一致だけを回帰として併走させます（主要効果の項目はゲートにしません）。world-v1を含むサイクルは`run`と`replay`に1分強かかります。評価器ハッシュにはworld-v1の研究コード・protocol・experiments・simulationの実行器を含めるため、これらの変更後は既存サイクルの`replay`が拒否されます。保存済みの結果は証拠として残り、新しいサイクルを登録します。

初回の検証: `npm run test:evolution` 3/3、型チェック成功。実際の予測候補でregister→seal→run→decideを完走し、`replay`で再現を確認。2026-09-10: `predictive-normal-world-m1`（world-v1）を固定ソースからrun・decide・replayし一致を確認、`npm run test:evolution` 4/4。

観察用の変換を変更したときは`npm run test:observer`（履歴3件、物語要約4件）で、入力の不変性と時点の整合、見どころの検出条件を確認します。`npm run narrate`の文面を変えた場合もこのテストを実行します。UI変更時の型チェックとビルドも実施します。

### Signal readiness / forgetting review archive

`research/results/signal-readiness-v1-*.json`と`forgetting-history-review.json`は、CLIの詳細出力から作った集計専用の`*-summary`形式です。protocol・実行時のprovenance・各群の集計・判定を保持し、個体別履歴、途中チェックポイント、probeのスコア列、個別測定値は含めません。`archive.fullOutputSha256`は集計前の出力のSHA-256です。CLIは引き続き詳細出力を`outputs/`へ生成します。詳細出力をそのままGitに追加しないでください。

### 音と距離変化の関連候補

```bash
npm run study:association -- --model sound-association-0.4.0-experimental.1 --split development --out outputs/association-new.json --check
node --experimental-strip-types cli/review-association.ts --out outputs/association-review-new.json
```

単一モデルCLIは対応利用・逆転・無音の3基準を`--check`で判定。既定モデルは対応未達のため終了1。比較CLIは6モデル×2群の制御課題とcore-v1の既定/候補比較を実行し、失敗時は終了1。両CLIとも集計専用JSON（個体履歴なし）を新規パスへ保存し、既存結果の上書きを拒否します。比較CLIの結果は`research/results/sound-association-v1-review.json`。確認群は観察済み、再実行は新規確認ではありません。
