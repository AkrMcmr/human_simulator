# 0007 / 忘却則の候補: 推定を保ち、確信だけ薄れる

- 状態: 登録（prospective）。結果を見る前にspecをコミットし、改訂サイクルCLIで登録・固定してから実行する。
- 旧モデルとソース: human 0.2.0（`human-0.2.0`）。候補は`forgetting-keep-estimate-0.3.0-experimental.1`、寄与無効は`forgetting-keep-estimate-ablated-0.3.0-experimental.1`（忘却則を旧版に戻した候補で、0.2.0と同じ計算）。
- 根拠: 工学的仮説。[判断0005](0005-experience-history-m2.md)と[0006](0006-reaction-reversal.md)で、現行の忘却が証拠を事前分布Beta(1,1)へ戻すため、接触のない期間に無害の記憶が薄れて危険度が上がる（480ステップで+0.070）ことを確認した。人間の記憶の理論や実測に基づく則ではない。
- 仮説と反証条件: [spec](../evolution/specs/forgetting-keep-estimate-m2.json)に記載。主要基準はreversal-v1の`gap-fading`の旧版−候補 ≥ 0.05（開発・確認とも）。反証は、差が0.05未満、capability（更新の遅れ・回復）の許容幅0.02超の低下、寄与無効の不一致、core-v1の未達・悪化、world-v1の副作用7項目の未達・寄与無効不一致のいずれか。
- 変更するもの・追加する仮定: `decideWithOptions`の`forgetting: "keep-estimate"`。毎ステップ、危害推定alpha/(alpha+beta)を固定したまま総量を2+(総量−2)(1−memoryDecay)へ縮める。既定0.2.0の計算は変えない。
- 固定するprotocolと評価器: reversal-v1（主要）、core-v1とworld-v1（回帰）。改訂サイクル`forgetting-keep-estimate-m2`（親`predictive-normal-world-m1`）。評価器ハッシュはregistration.jsonに記録。
- 開発条件・確認条件: reversal-v1の8001–8008と9001–9008は旧版の値を[0006](0006-reaction-reversal.md)で観察済みだが、候補の値は未観察。world-v1の4001–4008、5001–5008、core-v1のシードも同様に候補は未観察。閾値は結果を見て変えない。
- 予測: gap-fadingはほぼ0になり差は約0.07。更新の遅れ・回復は証拠総量の減り方が同じなのでほぼ同値（±0.02以内）。core-v1のfar-no-evidenceは事前分布のまま変化しないので0。world-v1では通常近接が多いため差は小さいと予測するが、離隔配置での警戒の残り方は観察対象。
- 本人に渡さないもの: 条件名、切替、安全/危険ラベル。
- 判定: 改善ゲート達成なら`retain-candidate`として保持し、既定化はレビュー後の版更新（human 0.3.0）とする。未達なら`revise`または`reject`。
- 結果ファイル・ハッシュ: 実行後に追記。
- 改善と悪化・代替説明: 実行後に追記。
- 採否と判断者・理由: 実行後に追記。
- 限界と次の問い: 推定を保つ忘却は、危害の記憶も接触なしには薄れないことを意味する。これが望ましいかは目的依存で、人間データによる校正はない。
