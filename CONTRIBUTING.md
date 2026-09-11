# 開発に参加する

このリポジトリだけで作業を再開できるようにするための入口です。人間の開発者とLLMエージェントで同じ設計・評価の約束を使います。

## 最初に読むもの

1. [現在地と未完了の作業](docs/STATUS.md): 既定モデル、実験候補、既知の限界。
2. [コンセプト](docs/CONCEPT.md): 目標、ユーザーが指定した初期能力、未決事項。
3. [設計と情報境界](docs/development/ARCHITECTURE.md): 何をどこで変更するか。
4. [モデルの計算](docs/MODEL.md): 係数・学習・単位・簡略化。
5. [研究ループ](research/LOOP.md): 仮説の登録、旧版比較、採否の記録。

LLMで作業する場合はルートの [AGENTS.md](AGENTS.md) も読みます。会話の過去ログ、特定のChatGPTアカウントや公開画面へのアクセスは、モデルの開発に必要ありません。

## ローカルで動かす

Git、Node.js 24系、npmを使います。既存CLIの最低条件はNode.js 22.13以上ですが、保存済み結果は24.19.0で検証しています。依存関係の取得にはnpmレジストリへのアクセスが必要です。

```bash
git clone https://github.com/AkrMcmr/human_simulator.git
cd human_simulator
npm ci
npm run typecheck
npm run test:model
npm run test:evaluation
npm run experiment -- --seed 42 --steps 400 --out outputs/encounter.json
```

CLIの引数は`--`の後に渡します。既定の実験・評価・テストにはAPIキー、データベース、LLM、GitHubの書き込み資格情報は不要です。

画面が必要なときは`npm run dev`を実行し、端末に表示されるローカルURLを開きます。保存済みのSitesのURLは所有者専用なので、参加者は自分のローカル画面を使ってください。ビルド手順と環境差は[実行・検証ガイド](docs/development/VALIDATION.md)に記載しています。

## 一つの変更の進め方

1. GitHubの最新mainを取得し、作業ツリーと進行中の変更を確認する。既存の作業を消さない。
2. `feat/<短い題名>`、`research/<短い題名>`、`docs/<短い題名>`などの作業ブランチを作る。作業対象と目的をPRの下書きや作業記録に残す。
3. 挙動を変える場合は`research/decisions/TEMPLATE.md`から判断記録を作り、仮説・対照・シード・主要指標・閾値を結果を見る前に固定する。
4. まず旧モデルをその評価器で測定し、候補を実装する。候補には独立した版と明確な入口を与える。
5. 変更に対応する検証だけを実行し、比較のJSONと読める要約を残す。未達は未達として報告し、成功するまで閾値を変更しない。
6. [PRテンプレート](.github/pull_request_template.md)に、理由、変更、証拠、限界、採用状態を記載する。レビュー後に既定化するか判断する。

主担当が直接mainへ反映することはあります。参加者には、独立したブランチとレビュー可能なPRを推奨します。これは新たな承認フローを自動で追加する規則ではありません。ユーザーが指定した作業・保存先・権限を尊重してください。

## 変更を置く場所

| 変更 | 主な場所 |
| --- | --- |
| 内部状態、記憶、効用、学習 | `packages/human/src` |
| 知覚として渡す情報の形式 | `packages/contracts/src` |
| 物理、資源、音、可視範囲 | `packages/world/src` |
| 更新順、記録と再開 | `packages/simulation/src` |
| 二人の初期条件や介入 | `packages/experiments/src` |
| 共通の回帰評価 | `packages/evaluation/src` |
| 登録済みモデルの一覧と既定の選択 | `packages/simulation/src/models.ts`（`research/evolution/models.ts`と一致させる） |
| 個別の新しい研究課題 | `research/protocols` と `research/studies` |
| 観察用の変換、見どころ・要約文、画面 | `packages/observer/src`（`story.ts`）と `app` |

## 共同作業と引き継ぎ

異なるLLM/開発者は別ブランチまたはworktreeで作業し、同じファイルを同時に編集するなら範囲を相談します。結果だけを口頭で引き継がず、[HANDOFFテンプレート](docs/development/HANDOFF.md)に現在のブランチ、変更、実行コマンド、未解決事項を残してください。個人名から能力・権限を推測しません。

このプロジェクトは、他者の内面が漏れないことと、同じ実験を追跡できることを重視します。「見た目が人間らしい」「物語として面白い」「LLMがもっともらしいと言った」は、認知モデルの妥当性の証拠になりません。

## 公開・権利

GitHubは公開リポジトリです。秘密情報、個人データ、資格情報、ライセンス上再配布できない論文本文やデータをコミットしないでください。論文はURL・書誌・必要最小限の要約で参照します。プロジェクト全体の公開ライセンスは未決定です。第三者コンポーネントの既存ライセンス表示は維持します。

GitHubへの反映とSitesへの公開は別操作です。共同開発や資料変更だけで公開画面を自動更新しません。公開する際は対象版と公開先を確認し、環境のSites手順を利用します。

## モデルのロジックを改訂する

[改訂サイクルのCLI](research/evolution/README.md)を使い、親モデル・反証条件・比較結果・次の問いを残してください。`npm run evolve -- next`が再開時の入口です。
