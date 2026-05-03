# SupportDeskPilot

Cloudflare Agents SDK と Cloudflare Think で作った、サポートデスク向け AI Agent デモです。

問い合わせチケットを Durable Object SQLite に保存し、Agent が検索、要約、優先度付け、返信案作成、内部メモ追加、ステータス変更を行います。変更系操作は human-in-the-loop の承認 UI を通して実行されます。

## 前提

- Node.js と npm が使えること
- Cloudflare アカウントにログインできること
- Workers AI を利用できる Cloudflare 環境であること

ローカル実行でも Workers AI binding を使うため、未ログインの場合は先にログインします。

```bash
npx wrangler login
```

## セットアップ

```bash
npm install
npm run cf-typegen
npm run dev
```

起動後、ブラウザで次を開きます。

```txt
http://localhost:5173/?workspace=acme-demo
```

`workspace` クエリは Agent インスタンス名です。同じ `workspace` を使うと同じ Durable Object SQLite の状態に接続します。別の名前にすると別インスタンスとして初期データから試せます。

ヘルスチェックは次で確認できます。

```txt
http://localhost:5173/health
```

## テナント単位のキャッチアップ

このアプリでは `workspace` を tenant ID として扱います。つまり、次の URL はそれぞれ別の `SupportDeskAgent` Durable Object インスタンスに接続します。

```txt
http://localhost:5173/?workspace=acme-demo
http://localhost:5173/?workspace=globex-demo
http://localhost:5173/?workspace=umbrella-demo
```

UI の `Tenant scope` では、現在接続している tenant の Object class、SQLite row counts、status / priority / category の内訳、最新 audit log を確認できます。

確認ポイント:

- tenant 名を切り替えると、`useAgent({ name })` の接続先 Durable Object が変わる
- 各 tenant は独立した Durable Object SQLite を持つ
- `Reset demo data`、内部メモ追加、ステータス変更は現在の tenant だけに反映される
- 同じ tenant に戻ると、その tenant の状態が残っている
- custom tenant 名を入力すると、新しい named Durable Object インスタンスが作られる

実装上は `src/client.tsx` の `switchTenant()` が URL の `workspace` を変更し、`useAgent()` の `name` に渡す値を切り替えます。server 側では `src/server.ts` の `getTenantOverview()` が、その tenant の SQLite 状態を集計して返します。

## よく使うコマンド

```bash
npm run dev
```

Vite と Cloudflare Workers のローカル開発サーバーを起動します。

```bash
npm run typecheck
```

TypeScript の型チェックを実行します。

```bash
npm run cf-typegen
```

`wrangler.jsonc` の binding から `worker-configuration.d.ts` を生成します。binding を追加、削除、変更したときに実行します。

```bash
npm run deploy
```

Vite でビルドして Cloudflare Workers にデプロイします。

## UI で試せること

トップ画面にはチケット一覧、Agent chat、承認 UI が表示されます。

- `Refresh tenant`: 現在の tenant のチケットと SQLite 集計を再取得
- `Reset demo data`: 現在の tenant のデモチケットを初期化
- `Toggle readonly`: 変更系ツールをブロックする readonly mode に切り替え
- `構造化JSON`: 最終回答を JSON schema に沿った構造化出力に切り替え
- `Clear chat`: チャット履歴をクリア
- `Draft reply for T-xxxx`: 選択中チケットの返信案作成を Agent に依頼
- `大阪の天気`: 許可済み `getWeather` tool で Open-Meteo から現在の天気を取得
- `天気をコードで比較`: codemode 内から `getWeather` を呼び、大阪と東京を比較

変更系の依頼では承認 UI が表示されます。`Approve` するとツールが実行され、`Reject` すると実行されません。

## 試すプロンプト

```txt
今あるopen/pendingチケットを優先度順に要約して、今日見るべき順番を提案して
```

```txt
T-1002の返信案をReplyDraftAgentに作らせて。friendly toneで。
```

```txt
T-1002に「調査中。ログイン後の白画面再現条件を確認する」という内部メモを追加して
```

```txt
T-1002のstatusをpendingに変更して。理由は「追加情報待ち」
```

```txt
codemodeを使って、open/pendingのチケットをpriorityとcategoryで集計して。上位3件の理由も出して。
```

```txt
runDynamicWorkerTicketAnalyticsを使って、全チケットの集計と今日見るべき順番を出して。
```

```txt
getWeather toolを使って大阪の現在の天気を取得して、日本語で短く要約して
```

```txt
codemodeを使って、大阪と東京の現在の天気をgetWeatherで取得し、気温と降水量を比較して
```

構造化JSONをオンにしてから、または `構造化レポート` ボタンで試します。

```txt
テナント acme-demo の構造化レポートをJSONで作成して
```

## アーキテクチャ

アーキテクチャの概要、責務分離、依存方向、実行フローは次に分離しています。

- [Architecture Overview](docs/architecture-overview.md)
- [Server Architecture](docs/server-architecture.md)
- [Cloudflare Agents Architecture](docs/cloudflare-agents-architecture.md)

## ローカル状態をリセットする

ローカル Durable Object の状態を完全に消したい場合は、`.wrangler/state` を削除してから再起動します。

```bash
rm -rf .wrangler/state
npm run dev
```

UI の `Reset demo data` は現在の tenant のチケットを初期化します。`.wrangler/state` の削除はローカル開発環境全体の状態を消します。

## デプロイ

```bash
npm run deploy
```

デプロイ前に `wrangler.jsonc` の `name`、`compatibility_date`、bindings、migrations が意図した値になっているか確認してください。

## 構成

```txt
support-desk-pilot/
  package.json
  wrangler.jsonc
  vite.config.ts
  tsconfig.json
  index.html
  src/
    server.ts
    client.tsx
    styles.css
```

## 参考

- Cloudflare Agents docs: https://developers.cloudflare.com/agents/
- Agents API: https://developers.cloudflare.com/agents/api-reference/agents-api/
- Think API: https://developers.cloudflare.com/agents/api-reference/think/
- Routing: https://developers.cloudflare.com/agents/api-reference/routing/
- Client SDK: https://developers.cloudflare.com/agents/api-reference/client-sdk/
