# 操作API

利用者（ゲーム・シミュレーション開発者）が身体へ与える**コマンド**、状態を読む**問い合わせ**、身体から通知される**イベント**を定める。すべての操作は領域（domain）と名前（name）で識別し、パラメータの単位は SI・ラジアンに固定する。エンジンのアダプタは、この API をそのまま露出するか、言語固有の薄い包みを提供する。

## 共通の意味論

### 適用のタイミング

- コマンドは刻みの境界で適用する。`tick` を省略すると次の刻み。過去の刻みは拒否。
- 同じ刻みの複数コマンドは、優先順位（`runtime` と `damage.set*`・`physio.set*` の外部設定 > `motor`・`grasp`・`face` の制御目標 > `pose` の補助）で解決し、同順位で同じ状態を矛盾して書く場合は両方を**拒否**して `rejected` イベントを出す。順序に依存しない。
- 問い合わせは状態を変えず、乱数を消費しない。いつでも呼べる。

### 結果

- 各コマンドに `accepted` または `rejected` イベントが 1 回返る。`rejected` には理由コード（`out_of_range`, `conflict`, `unreachable`, `unsupported_fidelity`, `invalid_params`, `locked`）が付く。
- 継続する操作（歩行、到達）は完了時に `reach`・`grasp` などの完了イベントを出す。

### 可動域違反の扱い

姿勢を設定する操作は `onViolation: "reject" | "clamp"` を持つ。既定は `clamp`（丸めて `accepted` にし、`payload.clamped: true` を付ける）。研究用途では `reject` を使って違反を検出する。

### 忠実度との関係

有効化されていない忠実度の操作は `unsupported_fidelity` で拒否する。例: 運動 L1 で `dynamics.applyForce` は拒否。問い合わせは全レベルで可能で、無効な層の値は既定値を返す。

### 記録

全コマンド・イベントは刻みと一緒に記録 `human-body/run` に残り、再実行で同じイベント列が再現される。表示専用の問い合わせは記録しない。

## カタログ

各行: 操作名、主なパラメータ、必要な忠実度、対応要件。詳細な型は実装時に `body-contracts` のスキーマへ落とし、ここでは意味を固定する。

### morph（形態）

| 操作 | パラメータ | 忠実度 | 要件 |
| --- | --- | --- | --- |
| `morph.create` | `BodySpec`（性別、年齢、身長、体重、比率、体組成、顔、シード） | 形態 L1 | FR-MORPH-01, 06 |
| `morph.regenerate` | 変更する項目の差分 | 形態 L1 | FR-MORPH-01 |
| `morph.setComposition` | 体脂肪率、筋量指数 | 形態 L2 | FR-MORPH-03 |
| `morph.setFace` | 顔パラメータ群 | 形態 L2 | FR-MORPH-04 |
| `morph.setAge` | 年齢（年）。成長・加齢モデルを適用 | 形態 L3 | FR-MORPH-05 |
| `morph.fromMeasurements` | ISO 7250 計測値の集合から BodySpec を推定 | 形態 L1 | FR-MORPH-01 |

### pose（姿勢・運動学）

| 操作 | パラメータ | 忠実度 | 要件 |
| --- | --- | --- | --- |
| `pose.setJoint` | 関節ID、自由度ごとの角度、`onViolation` | 運動 L0 | FR-KIN-01 |
| `pose.setPose` | 全関節の角度集合、補間時間 | 運動 L0 | FR-KIN-02 |
| `pose.setPreset` | プリセット名（stand, sit, crouch, lie_supine, ...）、補間時間 | 運動 L1 | FR-KIN-05 |
| `pose.reach` | 末端（手・足・頭）、目標位置・向き、制約（肘の向き等）、`onViolation` | 運動 L1 | FR-KIN-03 |
| `pose.lookAt` | 目標位置、頭と眼の分担比 | 運動 L1 | FR-FACE-03 |
| `pose.retarget` | 外部モーション（BVH / glTF）、マッピング表、接地補正の有無 | 運動 L1 | FR-KIN-04 |
| `pose.mirror` | 左右反転 | 運動 L0 | – |
| `pose.lock` / `pose.unlock` | 関節IDの集合（外部制御から保護） | 運動 L0 | – |

### dynamics（動力学）

| 操作 | パラメータ | 忠実度 | 要件 |
| --- | --- | --- | --- |
| `dynamics.applyForce` | 体節ID、力ベクトル（N）、作用点（体節座標）、持続時間 | 運動 L2 | FR-DYN-03 |
| `dynamics.applyImpulse` | 体節ID、力積（N·s）、作用点 | 運動 L2 | FR-DYN-03 |
| `dynamics.applyTorque` | 関節ID、トルク（N·m）、持続時間 | 運動 L2 | FR-DYN-03 |
| `dynamics.setGravity` | 重力ベクトル | 運動 L2 | FR-DYN-02 |
| `dynamics.setGround` | 地面の高さ・法線・摩擦・反発、または外部コリジョンの参照 | 運動 L2 | FR-DYN-04 |
| `dynamics.setRagdoll` | 有効 / 無効、筋緊張の残し方 | 運動 L2 | FR-DYN-04 |
| `dynamics.setBalance` | 有効 / 無効、踏み出し閾値、剛性 | 運動 L2 | FR-DYN-05 |
| `dynamics.attach` / `dynamics.detach` | 体節ID、外部物体の参照、拘束の種類（固定・ヒンジ・ロープ） | 運動 L2 | – |

### motor（運動制御）

| 操作 | パラメータ | 忠実度 | 要件 |
| --- | --- | --- | --- |
| `motor.locomote` | 目標速度（m/s）、進行方向、歩容（walk / run / auto）、歩幅・腕振りの係数 | 運動 L1 | FR-MOTOR-01, 05 |
| `motor.stop` | 減速時間 | 運動 L1 | FR-MOTOR-01 |
| `motor.turn` | 目標向き、回転方式（その場 / 歩きながら） | 運動 L1 | FR-MOTOR-01 |
| `motor.transition` | 目標姿勢（stand / sit / crouch / lie / kneel）、対象面の高さ | 運動 L1 | FR-MOTOR-02 |
| `motor.step` | 一歩の目標足位置 | 運動 L2 | FR-DYN-05 |
| `motor.climb` | 段差・階段の記述 | 運動 L2 | FR-MOTOR-04 |
| `motor.setStyle` | 姿勢の癖、左右差、速度依存の係数 | 運動 L1 | FR-MOTOR-05 |

### grasp（到達・把持）

| 操作 | パラメータ | 忠実度 | 要件 |
| --- | --- | --- | --- |
| `grasp.reach` | 手（左右）、対象の形状記述または位置、接近方向 | 運動 L1 | FR-MOTOR-03 |
| `grasp.grip` | 手、対象、把持型（power / precision / lateral / hook）、握力の割合 | 運動 L1（接触は L2） | FR-MOTOR-03 |
| `grasp.release` | 手 | 運動 L1 | FR-MOTOR-03 |
| `grasp.carry` | 対象、保持姿勢（片手 / 両手 / 肩） | 運動 L2 | FR-MOTOR-03 |
| `grasp.throw` | 対象、目標または初速 | 運動 L2 | – |

### face（表情・視線）

| 操作 | パラメータ | 忠実度 | 要件 |
| --- | --- | --- | --- |
| `face.setAU` | AU 番号ごとの強度（0〜1）、遷移時間 | 運動 L1 | FR-FACE-01 |
| `face.setExpressionPreset` | プリセット名と強度（AU の組み合わせとして定義） | 運動 L1 | FR-FACE-01 |
| `face.setBlendshapes` | ARKit 52 形状の重み（AU へ変換して適用） | 運動 L1 | FR-FACE-02 |
| `face.gaze` | 目標位置、速度、追従方式（saccade / smooth） | 運動 L1 | FR-FACE-03 |
| `face.blink` | 即時瞬き、または自動瞬きの有効 / 無効と間隔分布 | 運動 L1 | FR-FACE-03 |
| `face.speak` | viseme 列と時刻 | 運動 L1 | FR-FACE-04 |

### physio（生理）

| 操作 | パラメータ | 忠実度 | 要件 |
| --- | --- | --- | --- |
| `physio.setEnvironment` | 気温、湿度、風速、放射温、気圧 | 生理 L2 | FR-PHYS-03 |
| `physio.setClothing` | 衣服の断熱値（clo） | 生理 L2 | FR-PHYS-03 |
| `physio.intake` | 水（kg）、エネルギー（J）、電解質 | 生理 L2 | FR-PHYS-05 |
| `physio.setState` | 任意の生理変数の直接設定（実験条件として記録） | 生理 L1 | FR-PHYS-06 |
| `physio.rest` / `physio.sleep` | 継続時間、質 | 生理 L1 / L4 | FR-PHYS-02, 05 |

### damage（損傷・回復）

| 操作 | パラメータ | 忠実度 | 要件 |
| --- | --- | --- | --- |
| `damage.inflict` | 部位、種類、重症度（直接設定。衝撃からの自動判定は dynamics の接触から） | 応答 L1 | FR-DMG-05 |
| `damage.heal` | 部位、回復量または完全回復 | 応答 L1 | FR-DMG-04, 05 |
| `damage.setThresholds` | 部位ごとの損傷閾値表の差し替え | 応答 L2 | FR-DMG-01 |
| `damage.treat` | 処置の種類（固定、止血、鎮痛）。回復曲線と痛みへ影響 | 応答 L3 | FR-DMG-04 |
| `damage.setImpairment` | 可動域倍率、筋力倍率を部位ごとに直接設定 | 応答 L1 | FR-KIN-06 |

### surface（外見・付属）

| 操作 | パラメータ | 忠実度 | 要件 |
| --- | --- | --- | --- |
| `surface.setAppearance` | 皮膚・髪・目の色、髪型ID | 形態 L1 | FR-SURF-03 |
| `surface.setLOD` | 段階または画面占有率 | 形態 L0 | FR-SURF-01 |
| `surface.attach` / `surface.detach` | ソケットID、外部アセットの参照 | 形態 L1 | FR-SURF-02 |

### runtime（実行・記録）

| 操作 | パラメータ | 忠実度 | 要件 |
| --- | --- | --- | --- |
| `runtime.configure` | 刻み幅、忠実度、動力学後端、シード | – | BR-04, FR-REC-03 |
| `runtime.step` | 刻み数 | – | – |
| `runtime.checkpoint` | ラベル | – | FR-REC-02 |
| `runtime.restore` | チェックポイントID | – | FR-REC-02 |
| `runtime.export` | 形式（canonical / glTF / VRM / USD / FBX / BVH）、範囲 | – | [FORMATS](FORMATS.md) |
| `runtime.reset` | 身体仕様を保ったまま状態を初期化 | – | – |

## 問い合わせ

| 問い合わせ | 返すもの |
| --- | --- |
| `query.spec` | 身体仕様と生成された骨格寸法、資産ハッシュ |
| `query.pose` | 全関節角度・速度、ワールド変換 |
| `query.rom` | 現在の可動域（損傷・年齢の調整後）と基準値 |
| `query.reachability` | 末端と目標に対する到達可能性と最近接姿勢 |
| `query.contacts` | 接触点、法線、力 |
| `query.balance` | 重心、支持基底、安定余裕 |
| `query.physio` | 全生理変数（単位付き）と性能係数 |
| `query.damage` | 損傷一覧、部位ごとの機能倍率、痛み |
| `query.senses` | 本人の身体感覚（固有受容、接触、痛み、温冷、疲労感、渇き）。認知モデルへ渡す用途。他者の内部状態は含まない |
| `query.surface` | 変形後メッシュ（LOD 指定）、ソケット変換 |
| `query.events` | 範囲内のイベント列 |
| `query.versions` | 契約・解剖データ・各層・資産・後端の版 |

## イベント

| 種類 | 発生条件 | 主な payload |
| --- | --- | --- |
| `accepted` / `rejected` | 各コマンド | `commandId`、理由コード、`clamped` |
| `contact` | 新規接触・接触終了 | 体節、相手、力の大きさ |
| `fall` | 支持基底から重心が外れ、踏み出しで回復できない | 方向、転倒前速度 |
| `injury` | 損傷判定 | 部位、種類、重症度 |
| `pain` | 痛み強度の閾値通過 | 部位、強度 |
| `threshold` | 生理変数の設定閾値通過（疲労、深部温、水分） | 変数名、値、方向 |
| `reach` / `grasp` | 到達・把持の完了または失敗 | 末端、誤差、理由 |
| `transition` | 姿勢遷移の完了 | 遷移名 |

## 例

歩いて物を取り、疲れた状態を読む一連の操作（擬似コード）。

```ts
runtime.configure({ dt: 1/120, fidelity: { morph: 1, motion: 2, physio: 1, response: 1 }, seed: 7 });
morph.create({ sex: "female", ageYears: 30, statureM: 1.62, massKg: 56 });
motor.locomote({ speed: 1.3, heading: [1, 0, 0] });
// ... 刻みを進める ...
grasp.reach({ hand: "right", target: { shape: "cylinder", radius: 0.03, height: 0.2, position: [2.0, 0.9, 0.1] } });
// 完了イベント `reach` を待って
grasp.grip({ hand: "right", type: "power", force: 0.4 });
query.physio(); // { metabolicRateW, fatigue, coreTempC, ... }
query.senses(); // 本人が感じる疲労感・接触・痛み
```

## 互換性と版

操作名・パラメータ名・単位は `body-contracts` の版で管理する。操作の追加は副版、意味や単位の変更は主版を上げる。アダプタは契約の版を宣言し、不一致は読み込み時に拒否する。
