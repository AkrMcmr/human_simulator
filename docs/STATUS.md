# 現在地（2026-09-15）

## 動いているもの

既定モデルはhuman **0.2.0**。0.1.0の身体対処、同種個体の局所観察、危害の証拠、行動後の距離予測、連続音の試行と分類に加え、学習した行動別の距離変化から危険度の低下を見積もって全行動の効用へ加える項（予測効用）が既定になりました。CLIと観察UIは同じ二人の実行エンジンを使います。言葉の意味、社会、文化、生殖は未実装です。

simulation **0.2.0**で人間モデルを名前で選べます（`packages/simulation/src/models.ts`の登録簿。既定`human-0.2.0`、旧既定`human-0.1.0`、候補時代のID`predictive-0.2.0-experimental.1`（0.2.0と同じ計算）、対照`predictive-ablated-0.2.0-experimental.1`）。CLIは`--model`、UIは「人間モデル」で選択し、記録にはモデルIDと版を残します。別のモデルの記録を再生することは拒否されます。simulation 0.1.0形式の記録は読み込めません（無言の移行はしない方針）。

実行時のLLMは使いません。これは未校正の探索モデルで、高精度な人間の再現を確認したものではありません。

## 既定化した候補

human **0.2.0-experimental.1**（学習した距離変化から危険度の減少を予測し、全行動の効用へ加算。経験数・分散・身体要求で寄与を調整）を、所有者の承認を得てhuman **0.2.0**として既定化しました。計算は`packages/human/src/index.ts`の`predictedSafety`で、`decideHuman`の既定引数です。旧0.1.0は`decideLegacyHuman`と登録簿の`human-0.1.0`で再現できます。

[事前登録と採否](../research/decisions/0003-prediction-to-policy.md)に条件と限界を記録しています。開発8・確認8シードで5条件を達成し、寄与無効版は旧版と一致しました。同じcore-v1評価器で既存10項目の基準未達・許容幅を超える悪化はありませんでした。

- [開発結果](../research/results/policy-v1-development.md) / [測定JSON](../research/results/policy-v1-development.json)
- [確認結果](../research/results/policy-v1-validation.md) / [測定JSON](../research/results/policy-v1-validation.json)

制御課題に続き、[M1の通常world比較](../research/decisions/0004-normal-world-m1.md)を事前登録して実行しました。資源配置×初期距離×身体要求の8条件、600ステップ、二人とも同じモデル、開発8・確認8の未使用シード。主要効果（資源共有の配置で接触痛の起きるステップ割合を0.01以上減らす。実測は開発0.028・確認0.029）と副作用7項目（危険度、最低健康、身体要求の負担、生活技能の割合、離隔、予測誤差）を両群で達成。寄与無効は旧版と全64対で一致、core-v1に回帰なし。

- [開発結果](../research/results/world-v1-development.md) / [JSON](../research/results/world-v1-development.json)
- [確認結果](../research/results/world-v1-validation.md) / [JSON](../research/results/world-v1-validation.json)

費用も記録しています。共有配置では摂食・保温の選択が各4〜5%減り、身体要求の負担が+0.003〜0.015増えます（許容幅内）。近接の割合と平均距離はほぼ変わらず、至近距離（衝突）だけを避けています。この証拠と費用を[判断0004](../research/decisions/0004-normal-world-m1.md)に記録し、所有者の指示で既定化しました。0.2.0のcore-v1基準は[こちら](../research/baselines/v0.2.0-core-v1.md)で、0.1.0基準との差は全項目が許容幅内です。policy-v1の2001–2008、3001–3008、world-v1の4001–4008、5001–5008は観察済みで、以後は回帰チェックとしてだけ使います。

## 中期の到達点

次の3か月程度は、二人が経験から関わり方を変え、最小限の合図の成立条件を再現・検証できる実験室を目指します。[中期目標と達成条件](MIDTERM_GOALS.md)にM1〜M4を定めました。M1（protocol、比較CLI、シード別結果、採否記録、モデル選択と版記録、既定化）は完了。M2は履歴介入実験（[判断0005](../research/decisions/0005-experience-history-m2.md)）を完了し、観察画面の時系列表示も追加しました。反応の途中変化の制御実験も完了し、M3の受信側準備診断へ進んでいます。

## M2: 経験履歴と記憶介入

`npm run study:history`（protocol `history-v1`）で、危害あり/なしの履歴、記憶の保持・消去・入れ替え、強制近接と自由行動（食料共有/分離）を実験者が操作し、既定0.2.0の現象を確認しました。開発6001–6008・確認7001–7008で7項目すべて達成。

- P1: 危害履歴は同じ身体・知覚で危険度（差約0.39〜0.42）と離隔対接近の評価差（約0.61〜0.66）を上げる。相手の記憶を消すと差は0、入れ替えると反転する。差は相手の記憶に由来する。
- P2: 危害がなくなり相手が近くに居続けると危険度は約0.26〜0.28下がる。食料が別で回避できる配置では、8シード中5シードで一度も2.5u未満に入らず危険度が変わらない（強制近接との差約0.22〜0.25）。食料を共有する配置では身体要求が回避を上書きし、約72ステップ近接して強制近接とほぼ同じだけ下がる。
- 反例として記録: 身体要求が高い（空腹0.8）と予測効用の項の履歴依存は小さくなるが、評価全体の履歴依存はほとんど変わらない。忘却は事前分布へ戻る向きなので、無害の記憶も接触がなければ薄れる。

これらは工学的な機構の確認で、人間の信頼・恐怖・愛着の再現ではありません。パイロットシード6101–6104と開発・確認シードは観察済みです。

観察画面の「経験から判断へ」（Codexが追加）で、個体と相手を選び、危害推定、行動別の距離予測・分散・経験数、効用内訳、次の知覚、接触痛・摂食量を時系列で追えます。observer専用のスナップショットで、人間の判断には戻しません。

## M2続き: 反応の途中変化と忘却則の候補

`npm run study:reversal`（protocol `reversal-v1`、[判断0006](../research/decisions/0006-reaction-reversal.md)）で、無害→危害・危害→無害の切り替えと、接触のない期間の忘却を既定0.2.0で測りました。開発8001–8008・確認9001–9008で5項目達成。無害履歴60の後は履歴なしより危害への更新が約0.18〜0.28遅れ、履歴240ではさらに約0.09遅れる。危害履歴の後の回復は履歴が長いと遅い。接触のない480ステップで無害の記憶の危険度は0.015→0.085に上がる（事前分布へ戻る忘却）。

この最後の性質を改善目標に、忘却則の候補**0.3.0-experimental.1**「推定を保ち、確信（証拠の総量）だけ薄れる」を`decideWithOptions`の`forgetting: "keep-estimate"`として実装し、改訂サイクル`forgetting-keep-estimate-m2`（prospective）→`forgetting-keep-estimate-m2-b`（評価器修正後の再評価、retrospective）で旧版と比較しました（[判断0007](../research/decisions/0007-keep-estimate-forgetting.md)）。gap-fadingは0.070→0.000、更新の遅れ・回復は差0.003以内、core-v1とworld-v1に悪化なし、寄与無効は一致。`retain-candidate`で保持し、**追加の履歴実験とレビュー後も代替候補として保持**しています。推定を保つ忘却では、危害の記憶も新しい無害の接触なしには薄れません。

## M3: 音と結果の関連利用の準備診断

`npm run study:signal`を追加。音と接近/離隔の対応を一貫させる条件、音なし、音回数を保った対応シャッフル、音分類記憶の消去を比較しました。開発10001–10008・確認11001–11008で、音分類と新奇音への注意は達成、対応を距離調整へ使う項目は未達（差0、必要0.05）です。語義を与えずに次の不足機構を切り分ける制御課題であり、送信者の合図獲得・二人の言語創発は未検証です。[判断0008](../research/decisions/0008-signal-readiness-m3.md)。

忘却候補は追加のhistory-v1比較で両群7項目を達成しました。既知シードの回帰確認です。二つの忘却則の科学的優劣は決まらないため既定0.2.0を維持し、候補を残します。[判断0009](../research/decisions/0009-forgetting-adoption-review.md)。

## 次の作業

1. M3: 音条件付き予測を自由worldで検証する新protocolを登録する。自己運動との交絡・身体要求への副作用・途切れる音の影響を比較する。
2. 受信側の検証を踏まえ、発し手の音選択の学習と自由な二者相互作用を実装する。sound-association-v1の開発12001–12008・確認13001–13008は観察済み。
3. 忘却則は代替候補として維持。用途上の要件または実測に基づく比較で既定化を判断する。自由行動中の反応変化・混在モデルは継続課題。

性欲・生殖、発音能力と音素の発達、他者認知の精緻化は別の未決課題です。暗黙に初期設定へ追加しません。

## 結果を楽しみ、示唆を得るための入口

[ここまでにわかったこと](FINDINGS.md)が5つの発見と反例を平易に説明します。`npm run narrate`と観察画面の「この記録を読む」は、記録から見どころと要約文を自動生成します（observer層のみ。人間モデルへは戻しません。数値の説明であり、恐怖や信頼の再現とは呼びません）。

## 参加するには

[CONTRIBUTING](../CONTRIBUTING.md)から環境構築、設計、テスト、引き継ぎへ進めます。開発者はGitHubをcloneしてローカルで作業できます。公開画面は所有者専用で、今回の研究候補や文書変更では更新していません。

## ロジック自体の改訂基盤

[モデル改訂CLI](../research/evolution/README.md)で、登録→実装固定→旧版/候補/寄与無効の比較→採否→次課題を記録します。`npm run evolve -- next`で続きの課題を確認できます。評価器は`study`で選べ、core-v1（基礎能力）に加えてworld-v1（通常world）に接続しました。world-v1のサイクルでもcore-v1の回帰は常に確認します。

初回サイクル`predictive-retrospective`（core-v1、回帰確認のみ）に続き、子サイクル`predictive-normal-world-m1`（world-v1、主要基準contact-harm ≥ 0.01）を登録・固定・比較・判断しました。両群で改善ゲートを達成し`retain-candidate`。結果を先にstudy:world CLIで見た後の再評価なので登録種別はretrospectiveです。[結果](../research/evolution/cycles/predictive-normal-world-m1/result.json)と[判断](../research/evolution/cycles/predictive-normal-world-m1/decision.json)を保存しています。

評価器にreversal-v1を追加し、specの`regressionStudies`でworld-v1を副作用専用の回帰評価として併走できるようにしました。`forgetting-keep-estimate-m2`は初の`prospective`サイクルで、評価器の不備（寄与無効比較にモデルIDを含めた）により`revise`、修正後の子`forgetting-keep-estimate-m2-b`で`retain-candidate`です。失敗も系譜に残しています。評価器を変えるたびに旧サイクルの`replay`は拒否されますが、結果と判断は残ります。

## 今回の引き継ぎと反映先

Claudeの作業ブランチ`claude/repository-model-evolution-m5s86u`の`c2fc1af`まで（M1、0.2.0採用、M2実験）を確認し、その履歴を親に`codex/m2-observation-history`で観察表示を追加しました。mainへの統合と公開画面の更新は別です。今回の作業では公開していません。UIは通常の実験/再生記録を扱い、history-v1の集計JSONをシミュレーション記録として読み込む機能は含みません。

2026-09-15: Claudeのccabe254まで（忘却候補、反転学習、物語要約、研究ダイジェスト）を取り込み、`codex/m3-signal-readiness`で続きを実装。今回は研究CLIと資料のみ。UI・公開画面・既定モデルの変更はありません。新しいsignal-readiness評価は独立CLIで、evolveのstudy選択への接続はまだありません。

## M3追加: 音条件付き予測の候補を実装

`sound-association-0.4.0-experimental.1`が、音分類ごとの次の距離変化を記憶し、接近/離隔の評価へ利用します。関連学習・分類・注意・予測利用の4対照も登録。既定は0.2.0。制御課題の開発・確認各8検査を達成し、対応逆転に追従。core-v1各10項目も達成し許容幅超の悪化なし。[結果](../research/results/sound-association-v1-review.md) / [判断0010](../research/decisions/0010-sound-association.md)。

基点はPR #2統合後のClaudeブランチa898d6e、作業ブランチ`codex/m3-sound-association`。型チェック、modelテスト43件、関連課題とcore回帰を実行。`npm run study:association`で単一モデル、`node --experimental-strip-types cli/review-association.ts --out outputs/NEW.json`で比較を再現。studyのevolve専用評価器への接続、自由worldの効果検証、送信者学習は未実装。登録モデルは通常の実験CLIからも選択可能。公開Siteは更新していません。
