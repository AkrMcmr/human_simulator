# 現在地（2026-09-10）

## 動いているもの

既定モデルはhuman **0.1.0**。CLIと観察UIは同じ二人の実行エンジンを使います。身体対処、同種個体の局所観察、危害の証拠、行動後の距離予測、連続音の試行と分類があります。言葉の意味、社会、文化、生殖は未実装です。

simulation **0.2.0**で人間モデルを名前で選べます（`packages/simulation/src/models.ts`の登録簿。既定`human-0.1.0`、候補`predictive-0.2.0-experimental.1`、対照`predictive-ablated-0.2.0-experimental.1`）。CLIは`--model`、UIは「人間モデル」で選択し、記録にはモデルIDと版を残します。候補の記録を既定版として再生することは拒否されます。0.1.0形式の記録は読み込めません（無言の移行はしない方針）。

実行時のLLMは使いません。これは未校正の探索モデルで、高精度な人間の再現を確認したものではありません。

## 今回の候補

human **0.2.0-experimental.1**は、学習した距離変化から危険度の減少を予測し、発声以外を含む行動効用へ加算します。経験数・分散・身体要求で寄与を調整します。入口は`packages/human/src/predictive-policy.ts`です。既定のsimulation/UIには未接続です。

[事前登録と採否](../research/decisions/0003-prediction-to-policy.md)に条件と限界を記録しています。開発8・確認8シードで5条件を達成し、寄与無効版は旧版と一致しました。同じcore-v1評価器で既存10項目の基準未達・許容幅を超える悪化はありませんでした。

- [開発結果](../research/results/policy-v1-development.md) / [測定JSON](../research/results/policy-v1-development.json)
- [確認結果](../research/results/policy-v1-validation.md) / [測定JSON](../research/results/policy-v1-validation.json)

制御課題に続き、[M1の通常world比較](../research/decisions/0004-normal-world-m1.md)を事前登録して実行しました。資源配置×初期距離×身体要求の8条件、600ステップ、二人とも同じモデル、開発8・確認8の未使用シード。主要効果（資源共有の配置で接触痛の起きるステップ割合を0.01以上減らす。実測は開発0.028・確認0.029）と副作用7項目（危険度、最低健康、身体要求の負担、生活技能の割合、離隔、予測誤差）を両群で達成。寄与無効は旧版と全64対で一致、core-v1に回帰なし。

- [開発結果](../research/results/world-v1-development.md) / [JSON](../research/results/world-v1-development.json)
- [確認結果](../research/results/world-v1-validation.md) / [JSON](../research/results/world-v1-validation.json)

費用も記録しています。共有配置では摂食・保温の選択が各4〜5%減り、身体要求の負担が+0.003〜0.015増えます（許容幅内）。近接の割合と平均距離はほぼ変わらず、至近距離（衝突）だけを避けています。**既定化を推奨**しますが、既定モデルの置換はレビュー後の版更新として行うため、まだ候補です。policy-v1の2001–2008、3001–3008、world-v1の4001–4008、5001–5008は観察済みで、以後は回帰チェックとしてだけ使います。

## 中期の到達点

次の3か月程度は、二人が経験から関わり方を変え、最小限の合図の成立条件を再現・検証できる実験室を目指します。[中期目標と達成条件](MIDTERM_GOALS.md)にM1〜M4を定めました。M1の成果物（protocol、比較CLI、シード別結果、採否記録、モデル選択と版記録）は揃いました。既定化の判断がレビュー待ちです。

## 次の作業

1. 既定化のレビュー。採用する場合は`decideHuman`の既定を候補の計算にしてhuman 0.2.0へ版を上げ、旧版を`human-0.1.0`として登録簿に残し、core-v1基準を再記録し、UI/CLIの既定を更新する。採用しない場合はその理由を0004へ追記する。
2. M2の履歴介入protocolを登録する。危害を受けた履歴/受けなかった履歴、記憶の保持・消去・入れ替えの対照。M1のstudy:worldと登録簿を再利用する。
3. 機構分析。共有配置で摂食・保温が減る経路（食料の周りで至近距離を避けるために生活行動を後回しにしているか）と、片方だけ候補の混在条件を別protocolで調べる。

性欲・生殖、発音能力と音素の発達、他者認知の精緻化は別の未決課題です。暗黙に初期設定へ追加しません。

## 参加するには

[CONTRIBUTING](../CONTRIBUTING.md)から環境構築、設計、テスト、引き継ぎへ進めます。開発者はGitHubをcloneしてローカルで作業できます。公開画面は所有者専用で、今回の研究候補や文書変更では更新していません。

## ロジック自体の改訂基盤

[モデル改訂CLI](../research/evolution/README.md)で、登録→実装固定→旧版/候補/寄与無効の比較→採否→次課題を記録します。`npm run evolve -- next`で続きの課題を確認できます。評価器は`study`で選べ、core-v1（基礎能力）に加えてworld-v1（通常world）に接続しました。world-v1のサイクルでもcore-v1の回帰は常に確認します。

初回サイクル`predictive-retrospective`（core-v1、回帰確認のみ）に続き、子サイクル`predictive-normal-world-m1`（world-v1、主要基準contact-harm ≥ 0.01）を登録・固定・比較・判断しました。両群で改善ゲートを達成し`retain-candidate`。結果を先にstudy:world CLIで見た後の再評価なので登録種別はretrospectiveです。[結果](../research/evolution/cycles/predictive-normal-world-m1/result.json)と[判断](../research/evolution/cycles/predictive-normal-world-m1/decision.json)を保存しています。
