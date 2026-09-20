# 0035 / 慣習的な合図の成立を16シードで再現する（convention-v2 第2ラウンド）

- 状態: 登録（prospective）。第2ラウンドのシードをコミットしてから、ゲート不変で測る。パイロットは行わない。
- 背景: [判断0024](0024-convention-v2.md)は8シード×2群の1回の実行で成立した。その後の系統（伝達・世代）では、空腹系の指標が8〜16シードで揺れることが分かった（[0029](0029-transmission-v2.md)・[0030](0030-generations.md)）。中核の成立を、観察していない16シード×2群で再現できるかを確かめる。
- 変更: なし（世界・モデル・評価器・閾値はconvention-v2のまま）。
- 候補と対照: `convention-contrast-0.10.0-experimental.2`（候補）、`convention-no-imitation-0.10.0-experimental.1`（真似なし）、`human-0.2.0`。
- 仮説と反証条件（evaluator: convention-v2、5項目、閾値不変）:
  - H1: 候補が5項目を両群で達成すれば、0024の成立を「16シードでも再現」と記す。
  - 反証: どちらかの群でどれかが未達。その場合、0024の成立に「8シードの1回」という限定を明記し、未達の項目を示唆に格下げする。
- 開発条件・確認条件: 第2ラウンド、開発66001–66016、確認67001–67016。いずれも未使用。
- 実行コマンド: `npm run study:referential -- --protocol convention2 --round 2 --split development --model human-0.2.0 --model convention-no-imitation-0.10.0-experimental.1 --model convention-contrast-0.10.0-experimental.2 --out outputs/convention-v2-round2-development.json`（確認は`--split validation`）。
- 結果ファイル・ハッシュ: 実行後に追記。
- 採否と判断者・理由: 実行後に追記。
