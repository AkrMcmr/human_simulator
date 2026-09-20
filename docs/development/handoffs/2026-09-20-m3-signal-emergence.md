# 引き継ぎ 2026-09-20: M3 合図の成立から慣習・伝達・世代まで

- 目的・ユーザーが許可した範囲: 「言語が生まれるまで試行錯誤を繰り返し、モデルおよび検証環境に改善を加え続ける」。所有者は状態連動の声を初期能力として認めた（判断0013）。既定モデルの昇格は行っていない。
- GitHubブランチ/基点コミット: `claude/repository-model-evolution-m5s86u`。この引き継ぎ時点の先頭は本ファイルを含むコミット。基点はf68f0c7（referential-v2の記録）。
- ローカルだけの変更とコミット: なし（毎段階でコミット・プッシュ）。`outputs/`は未追跡（生成結果はresearch/resultsに集約版のみ保存）。
- 読んだ設計・研究判断: docs/CONCEPT.md、docs/MODEL.md、判断0011〜0015。以後0016〜0035を本セッションで追加。
- 既定モデル/候補モデル/評価器の版: 既定human-0.2.0（不変）。契約0.3.0（`poison`効果を任意追加）、世界0.6.0（0.3.0で食料の出現、0.4.0で暖かい場所の移り変わり、0.5.0で毒の食料、0.6.0で食料の寿命。既定の挙動は不変で保存測定値を再現）、シミュレーション0.2.0。候補: eating-voice-*（0.8.0-exp.2）、*-referent（0.8.0-exp.3）、learned-caller（0.9.0-exp.1）、convention / convention-no-imitation（0.10.0-exp.1）、convention-contrast（0.10.0-exp.2）、lexicon（0.11.0-exp.1〜5）、valence（0.12.0-exp.1、`packages/human/src/valence.ts`）、valence-aversion / valence-private（0.12.0-exp.2、同ファイルの`mode`引数）。
- 変更ファイルと理由: `packages/human/src/forager-listener.ts`（出所評価の聞き手、食べる声、慣習の発し手、対比、費用学習）、`packages/human/src/lexicon.ts`（2文脈）、`packages/human/src/index.ts`（warmthOrienting・shelterCallフック）、`packages/world/src/index.ts`（0.3.0/0.4.0）、`packages/simulation/src/index.ts`（設定検証）、`research/studies/referential-v1.ts`（人数一般化、到着遅れ、後ろ3分の1の窓、声の散らばり・任意性、呼び声の抑制、新参者・世代の介入と指標）、protocol群 referential-v3〜v5 / caller-cost-v1 / convention-v1〜v2 / lexicon-v1〜v2 / transmission-v1〜v2 / generations-v1、`cli/study-referential.ts`（`--protocol`にすべて追加）。
- protocol・シード: 各判断記録に明記。観察済み: 20001〜59008の各群。未使用: なし（次のラウンドは新しい番号帯を切ること）。
- 実行したコマンドと終了結果: 各判断記録の「実行コマンド」欄。`npm run test:model` 92/92、`npm run typecheck`・`npm run lint` 成功（最終確認は判断0030の時点、以後の変更もテスト通過）。
- 基準版との差・許容幅を超えた悪化: 既定モデルは不変。世界0.3.0/0.4.0は既定設定で挙動不変（テストで保存結果と一致）。
- 結果ファイル・ハッシュ: `research/results/*-{development,validation,pilot}.{json,md}`（ソースコミット・モデル/評価器/環境のSHA256を含む）。
- 採用/候補/保留と理由: 成立（候補のまま）: 受け手側の種類利用（0020）、慣習的な合図の最小形（0024）。頑健だが5項目未達: 新参者への産出の伝達（0029）。反証: 発し手の費用学習で黙る（0021）、2文脈の語彙（0025〜0027・0031）、系統の連続（0030、漂いとして記録）。
- valence（判断0037・0038）: 毒の食料で良い声と悪い声が両群で分かれた（区別0.283 / 0.213、対照0.06未満）が確認群は閾値0.25未達、毒の利益は後ろ3分の1で0付近。世界0.6.0（腐る食料）のvalence-v2（72001–/73001–）では区別が両群で閾値を越えた（0.264 / 0.272）が毒の利益は負。原因は既定の知覚が見えている食料で場所記憶を上書きすること（記憶を消しても目の前の毒は食べる）。味覚嫌悪の候補`valence-aversion-0.12.0-experimental.2`と私的嫌悪の対照`valence-private-0.12.0-experimental.2`をvalence-v3（74001–/75001–）で事前登録（判断0039）。
- 未解決事項・失敗した試み: 第2の指示対象は6ラウンド未成立（0025〜0027・0031・0033・0034。到達点は「1回の実行の中で暖かさの声も集まり、食料の声から0.2ほど離れる」）。新参者の理解面・世代の連続は分散が大きく8〜16シードで判定が揺れる。世代の連続は窓を広げても未達で、漂いを現象として記録（0030・0032）。
- 次の一手: (1) 所有者の承認を要する設計案: 文脈ごとの産出目録、聴覚分類の解像度、分離幅を聴覚分類に合わせて学習する規則。(2) 承認不要: 成立した慣習（0024）の16シードでの再現（0035、実行中）、漂いの分布を報告指標にした登録、観察画面への慣習の表示。
- GitHubへの反映状態・公開画面への反映状態: すべてプッシュ済み。ダイジェスト（docs/digest/index.html、発見1〜12）はArtifact版3として公開済み。
