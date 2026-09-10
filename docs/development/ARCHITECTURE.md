# 設計と情報の境界

## 読む入口

1. `packages/contracts/src/index.ts`: `Observation`、`ActionIntent`、`PhysicalEffect`、`DecisionTrace`。
2. `packages/human/src/index.ts`: `createHuman`、`decideHuman`、`applyPhysicalEffect`。
3. `packages/world/src/index.ts`: `senseWorld`と`advanceWorld`。
4. `packages/simulation/src/index.ts`: `stepSimulation`で上記を接続する。

依存方向はhuman→contracts、world→contracts、simulation→human/world/contractsです。humanとworldは互いをimportしません。evaluationと個別研究は実験者の層なので、これらを組み合わせたり介入したりできますが、その介入をモデルの知覚へ紛れ込ませないでください。

## 一ステップの契約

`stepSimulation`は全員について同じ更新前の世界を知覚し、個体ごとに判断した後、世界へ同時に行動を適用します。物理作用を本人の身体に反映して次の時点へ進みます。

| データ | 所有者 | 本人に見える範囲 |
| --- | --- | --- |
| 全個体の位置・速度・資源・放射された音 | world | `senseWorld`が切り出す局所的な手掛かりのみ |
| 身体、危害の証拠、行動別の予測、音の分類 | 各human | 自分の状態のみ |
| 全員の判断記録と内部状態の表示 | 実験者・observer | 表示用。次の意思決定へ戻さない |
| 初期条件、seed、版、実行履歴 | simulation/experiment | 自分の観測を超える正解情報を渡さない |

`DecisionTrace.tick=t`は判断入力の時点です。`Frame.tick=t+1`にはその行動を適用した後の身体・世界が入ります。学習は次の局所観測が届いてから行います。結果を見て更新した予測を「事前予測」として採点しないでください。

## 乱数と純粋性

乱数は`keyedRandom(seed, stream, tick)(purpose, index)`です。用途ごとにキーを分け、別個体や表示処理が乱数列を消費しないようにします。モデル内で`Math.random`、時刻、通信、React、DOM、ブラウザストレージを使いません。

human/worldは入力を変更しない純粋な遷移として扱います。実験者がチェックポイントや記憶を変更する介入は、protocolに対象・タイミング・意味を記載してください。

## 候補モデルの入口

既定の`decideHuman(human, observation, random)`はv0.1.0です。第4引数の`OutcomeBonus`は実験用の効用加算で、未指定なら従来の結果を維持します。本人の状態と知覚した相手の距離/追跡IDを使い、追加分を`terms.predictedSafety`に残します。

`packages/human/src/predictive-policy.ts`の`decidePredictive`がこの拡張を使う実験候補です。これは通常のsimulation/UIへ自動接続されません。`research/studies/policy-v1.ts`は基準版・候補・寄与無効版を`ModelAdapter`で同じ課題へ接続します。

現在の`ModelAdapter`はv0.1の`HumanState`に型として依存しています。将来まったく違う状態表現へ移る場合はアダプターの契約も設計し直します。あらゆる認知理論へそのまま差し替えられる汎用規格だとは扱いません。

## 境界を変えるとき

知覚項目の追加、更新順、世界の物理、身体・記憶形式はそれぞれ影響範囲が異なります。[版と再現のルール](VERSIONING.md)に従い、関連する不変条件と比較条件を更新します。会話の意味、相手の意図、文化のルールを外から直接設定すると、創発を観察する目的が変わります。必要な初期能力はCONCEPTの未決事項としてまず明示してください。
