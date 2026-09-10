# Human World Lab

人間の知覚・判断・行動・フィードバックを、LLMに判断を委ねずに実験するための基盤です。最初の実験は、生活技能を持つ二人の個体が、コミュニケーションの定石を持たずに出会う場面です。

**v0.1は未校正の探索モデルです。高精度な人間の再現や、言語の創発を達成したものではありません。** 実行時のLLM・外部API・ネットワークは、人間モデルに含まれません。

## 開発者・LLMの入口

[参加ガイド](CONTRIBUTING.md) → [現在地](docs/STATUS.md) → [設計](docs/development/ARCHITECTURE.md) → [検証手順](docs/development/VALIDATION.md)。版と採用のルールは[こちら](docs/development/VERSIONING.md)、作業の引き継ぎは[テンプレート](docs/development/HANDOFF.md)を使います。

距離予測を行動選択へつなぐ実験候補`0.2.0-experimental.1`を追加しました。制御課題の開発・確認評価は合格していますが、通常worldでの検証前なので既定版は0.1.0です。

```bash
npm run study:policy -- --split development --out outputs/policy-development.json
npm run test:policy
```

中期の開発方針と達成条件は[中期目標](docs/MIDTERM_GOALS.md)にまとめています。

## 構造

| 場所 | 責務 |
| --- | --- |
| `packages/contracts` | 外部から知覚できる情報と行動の契約 |
| `packages/human` | 身体状態、個体の記憶、推定、効用評価と学習 |
| `packages/world` | 位置、可視・可聴範囲、音、食料、熱環境、衝突 |
| `packages/simulation` | 同時更新、乱数、実験記録、再現検証 |
| `packages/experiments` | 初期条件、介入、評価指標、複数シード比較 |
| `packages/evaluation` | 基礎能力の仮説検証、対照実験、旧版との比較 |
| `packages/observer` | 記録から表示情報を作る読み取り専用の層 |
| `app` | 観察UI。CLIと同じ実行エンジンを使用 |
| `cli` | 画面なしでの実行、比較、記録の保存・再開 |

まずモジュールを分離した一つのリポジトリで運用します。独立した版管理や依存関係が必要になった段階で分割します。理由は [ADR 0001](docs/decisions/0001-modular-monorepo.md) に記録しています。

## 実行

Node.js 22.13以上を使用します。再現検証に使った環境はNode.js 24.19.0です。

```bash
npm ci
npm run test:model
npm run experiment -- --seed 42 --steps 400 --out outputs/encounter.json
npm run compare -- --seed 42 --steps 400 --out outputs/comparison.json
npm run experiment -- --resume outputs/encounter.json --out outputs/resumed.json
```

`--distance 12`、`--curiosity-a 0.6`、`--curiosity-b 0.6`、`--layout shared|separate`、`--mute` で条件を変更できます。`--mute` は音の伝達だけを無効にし、発声そのものは残します。

UIの開発・ビルド:

```bash
npm run dev
npm run typecheck
npm run build
node --test tests/rendered-html.test.mjs
```

UIは最初は停止しています。「再生」で実行し、個体の知覚、効用値、身体状態、音の分類を観察します。スライダーで過去の記録を表示できます。条件変更は「この条件で新しい実験」を押すまで適用しません。画面内の履歴はページを閉じると失われるので、残したい実験はJSONを書き出してください。

「条件比較」は二人の好奇心を0.15/0.55/0.90に変え、同じ8シードを各条件で実行します。表示は平均と標本標準偏差です。統計的有意性の主張は行いません。

## 継続評価

```bash
npm run evaluate -- --out outputs/evaluation.json
npm run evaluate -- --baseline research/baselines/v0.1.0-core-v1.json --out outputs/candidate.json
npm run test:evaluation
```

警戒・予測・身体対処の10項目を、開発8シードと確認8シードで評価し、JSONとMarkdownを出力します。`--check`で基準未達・旧版からの悪化を終了コードに反映できます。判定は工学的仮説の達成状況で、人間らしさの総合点ではありません。

仮説登録から採否の記録までの手順、対照条件と限界は [研究ループ](research/LOOP.md) を参照してください。

## 進化させる手順

1. [コンセプト](docs/CONCEPT.md) と [現在の仮定](docs/MODEL.md) を読む。
2. 説明したい現象と反証できる予測を、実装前に明記する。
3. 人間・世界・観察のどの責務かを定め、変更と版を記録する。
4. 単体の物語ではなく、複数シード・対照条件・必要なら実測データと比較する。
5. [検証記録](docs/VALIDATION.md) に、確認できたことと未確認のことを残す。

次の候補と未決事項は [ROADMAP](docs/ROADMAP.md) を参照してください。

## 実験の再現

記録には初期条件、モデル各層の版、乱数方式、ソースのコミットとツリー、依存ロックのハッシュ、実行環境、チェックポイント、全ステップの観察・判断が含まれます。UIの実行環境文字列はJavaScript/browserという分類で、ブラウザのバージョンは自動収集しません。

乱数はシード・個体ID・ステップ・用途から独立に生成します。同じステップでは全員が同じ更新前の世界を観察してから行動し、世界を一度だけ更新します。個体の処理順や画面の読み取りが結果を変えない設計です。

JSON読み込み時は、同版の初期条件から再実行し、チェックポイントの完全一致を検証します。保存された表示フレームは信用せず再生成します。異なるモデル版への無言の変換はしません。異なるJavaScript実装を含むビット単位の互換性は未検証で、不一致はエラーとして通知します。

## 保存先

開発リポジトリ: [AkrMcmr/human_simulator](https://github.com/AkrMcmr/human_simulator)

観察画面: [Human World Lab](https://human-world-lab.diodario.chatgpt.site)（所有者専用）

Sites用の設定を同梱しています。GitHubでソースを管理し、Sitesの公開用ソース保存先とは分けて運用します。GitHubへの初回登録は内容を同期するため、コミットIDは公開版のソースIDと異なります。公開済み初版のソースIDは `dd905ad144e31478cf9848e6114266968c6aa10a` です。公開ライセンスはまだ選択していません。

## 人間モデルのロジックを育てる

個体内の学習に加え、開発者・LLMがモデル自体を改訂する[外側のループ](research/evolution/README.md)を備えています。`npm run evolve -- status`で候補の状態、`npm run evolve -- next`で次の課題を確認できます。
