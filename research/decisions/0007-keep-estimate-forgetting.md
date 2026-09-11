# 0007 / 忘却則の候補: 推定を保ち、確信だけ薄れる

- 状態: 候補保持（retain-candidate）。改善ゲートを両群で達成。既定化はレビュー待ち。
- 旧モデルとソース: human 0.2.0（`human-0.2.0`）。候補は`forgetting-keep-estimate-0.3.0-experimental.1`、寄与無効は`forgetting-keep-estimate-ablated-0.3.0-experimental.1`（忘却則を旧版に戻した候補で、0.2.0と同じ計算）。
- 根拠: 工学的仮説。[判断0005](0005-experience-history-m2.md)と[0006](0006-reaction-reversal.md)で、現行の忘却が証拠を事前分布Beta(1,1)へ戻すため、接触のない期間に無害の記憶が薄れて危険度が上がる（480ステップで+0.070）ことを確認した。人間の記憶の理論や実測に基づく則ではない。
- 仮説と反証条件: [spec](../evolution/specs/forgetting-keep-estimate-m2.json)に記載。主要基準はreversal-v1の`gap-fading`の旧版−候補 ≥ 0.05（開発・確認とも）。反証は、差が0.05未満、capability（更新の遅れ・回復）の許容幅0.02超の低下、寄与無効の不一致、core-v1の未達・悪化、world-v1の副作用7項目の未達・寄与無効不一致のいずれか。
- 変更するもの・追加する仮定: `decideWithOptions`の`forgetting: "keep-estimate"`。毎ステップ、危害推定alpha/(alpha+beta)を固定したまま総量を2+(総量−2)(1−memoryDecay)へ縮める。既定0.2.0の計算は変えない。
- 固定するprotocolと評価器: reversal-v1（主要）、core-v1とworld-v1（回帰）。改訂サイクル`forgetting-keep-estimate-m2`（親`predictive-normal-world-m1`）。評価器ハッシュはregistration.jsonに記録。
- 開発条件・確認条件: reversal-v1の8001–8008と9001–9008は旧版の値を[0006](0006-reaction-reversal.md)で観察済みだが、候補の値は未観察。world-v1の4001–4008、5001–5008、core-v1のシードも同様に候補は未観察。閾値は結果を見て変えない。
- 予測: gap-fadingはほぼ0になり差は約0.07。更新の遅れ・回復は証拠総量の減り方が同じなのでほぼ同値（±0.02以内）。core-v1のfar-no-evidenceは事前分布のまま変化しないので0。world-v1では通常近接が多いため差は小さいと予測するが、離隔配置での警戒の残り方は観察対象。
- 本人に渡さないもの: 条件名、切替、安全/危険ラベル。
- 判定: 改善ゲート達成なら`retain-candidate`として保持し、既定化はレビュー後の版更新（human 0.3.0）とする。未達なら`revise`または`reject`。
- 結果ファイル・ハッシュ: 親サイクル[`forgetting-keep-estimate-m2`](../evolution/cycles/forgetting-keep-estimate-m2/result.json)（prospective、[判断](../evolution/cycles/forgetting-keep-estimate-m2/decision.json)はrevise）と子サイクル[`forgetting-keep-estimate-m2-b`](../evolution/cycles/forgetting-keep-estimate-m2-b/result.json)（retrospective、[判断](../evolution/cycles/forgetting-keep-estimate-m2-b/decision.json)はretain-candidate）。評価器・モデルのハッシュは各registration/seal.jsonに記録。
- 改善と悪化・代替説明: 主要基準gap-fadingは旧版0.070→候補0.000で差0.070（両群、閾値0.05）。接触のない480ステップの後の危険度は旧版0.015→0.085、候補は0.012のまま。更新の遅れ・回復は差0.003以内。core-v1はsafe-learning/danger-discrimination/caution-policyが+0.001〜0.002（許容0.02）、他は0。world-v1の副作用7項目は達成で、差は±0.005以内。分離配置の離隔割合・危険度は旧版と同値（そもそも近接がなく証拠が事前分布のまま）。寄与無効は旧版と一致。親サイクルでは評価器が寄与無効の比較にモデルIDの文字列を含めており、同じ計算結果でも不一致と判定された。この不備を直し、仮説・閾値・モデルを変えずに子サイクルで再評価した。
- 採否と判断者・理由: 判断者はこのセッションのLLM（Claude）。事前登録した規則に従い`retain-candidate`。既定化はレビュー後の版更新（human 0.3.0）として別に判断する。注意点として、推定を保つ忘却は危害の記憶も接触なしには薄れないので、「許し」に相当する変化は新しい無害の接触が起きたときにだけ生じる。
- 限界と次の問い: 推定を保つ忘却は、危害の記憶も接触なしには薄れないことを意味する。これが望ましいかは目的依存で、人間データによる校正はない。次: 既定化のレビュー。採用ならhuman 0.3.0へ版を上げ、core-v1基準を再記録し、history-v1とreversal-v1を新既定で再測定して記録する。並行してM3の最小合図protocolを設計する。

## 2026-09-11 結果（子サイクルm2-b）

| 評価器 | 項目 | 開発 | 確認 | 判定 |
| --- | --- | ---: | ---: | --- |
| reversal-v1 | gap-fading 旧版−候補（主要） | 0.0699 | 0.0699 | ≥ 0.05 達成 |
| reversal-v1 | capability 4項目の差 | ≤ 0.003 | ≤ 0.003 | 悪化なし |
| core-v1 | 10項目の差 | ≤ +0.0022 | ≤ +0.0021 | 悪化なし |
| world-v1 | 副作用7項目 | 達成 | 達成 | 寄与無効一致 |
