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

## Cloudflare Agents SDK の基本

この repo では `src/server.ts` が Worker 側、`src/client.tsx` が React UI 側です。

### 1. Agent クラスを作る

`SupportDeskAgent` は `Think` を継承しています。

```ts
export class SupportDeskAgent extends Think<Env, SupportDeskState> {
  initialState = { ... };

  getModel() {
    return createWorkersAI({ binding: this.env.AI })("@cf/moonshotai/kimi-k2.6");
  }

  getTools() {
    return { ... };
  }
}
```

`Think` は Cloudflare Agents SDK 上のチャット Agent 基盤です。モデル呼び出し、メッセージ永続化、ストリーミング、ツール実行、承認待ち、sub-agent 呼び出しを扱います。

### 2. Durable Object として binding する

`wrangler.jsonc` で Agent クラスを Durable Object として登録しています。

```jsonc
"durable_objects": {
  "bindings": [
    {
      "class_name": "SupportDeskAgent",
      "name": "SupportDeskAgent"
    }
  ]
},
"migrations": [
  {
    "tag": "v1",
    "new_sqlite_classes": ["SupportDeskAgent"]
  }
]
```

Agent は Durable Object として動くため、インスタンスごとに状態と SQLite storage を持ちます。このデモでは `workspace` ごとにチケット、メモ、返信案、監査ログが保存されます。

### 3. リクエストを Agent にルーティングする

`src/server.ts` の default export で `routeAgentRequest()` を呼びます。

```ts
return (
  (await routeAgentRequest(request, env)) ||
  new Response("Not found", { status: 404 })
);
```

これにより、ブラウザからの Agent 接続、チャット、RPC 呼び出しが該当する Durable Object インスタンスに届きます。

### 4. React から Agent に接続する

`src/client.tsx` では `useAgent()` で Agent インスタンスに接続します。

```ts
const agent = useAgent<SupportDeskAgent, SupportDeskState>({
  agent: "SupportDeskAgent",
  name: workspace
});
```

`agent.state` はサーバー側の Agent state と同期されます。このデモでは `workspaceId`、`mode`、`openTicketCount`、`urgentTicketCount` などを UI に表示しています。

### 5. callable method を RPC として呼ぶ

`@callable()` を付けたメソッドは、クライアントから `agent.stub` 経由で呼べます。

```ts
const rows = await agent.stub.listTickets("all", "all", 20);
await agent.stub.seedDemoData({ reset: true });
await agent.stub.setMode("readonly");
```

この repo の主な callable method は次です。

- `seedDemoData()`: デモデータを投入またはリセット
- `setMode()`: `normal` / `readonly` の切り替え
- `listTickets()`: チケット一覧取得
- `getTicket()`: チケット詳細、メモ、返信案取得
- `searchTickets()`: キーワード検索
- `getWeather()`: Open-Meteo から現在の天気を取得
- `runDynamicWorkerTicketAnalytics()`: Dynamic Worker で分析
- `addInternalNote()`: 内部メモ追加
- `changeTicketStatus()`: ステータス変更
- `draftReplyWithSubAgent()`: sub-agent で返信案作成

### 6. チャット UI から Agent に依頼する

`useAgentChat()` は Agent とのチャット、ストリーミング、ツール承認状態を扱います。

```ts
const { messages, sendMessage, addToolApprovalResponse } = useAgentChat({
  agent,
  body: () => ({
    mode: readonly ? "readonly" : "normal",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  })
});
```

`sendMessage({ text })` でユーザー発話を送信します。`addToolApprovalResponse()` は `needsApproval` 付きツールの承認または拒否に使います。

### 7. Agent にツールを渡す

`getTools()` で AI SDK の `tool()` を返すと、Agent が必要に応じてツールを呼びます。

```ts
getTools(): ToolSet {
  return {
    listTickets: tool({ ... }),
    getTicket: tool({ ... }),
    addInternalNote: tool({
      ...,
      needsApproval: async () => true
    })
  };
}
```

このデモでは読み取り系ツールと変更系ツールを分けています。変更系は `needsApproval` を付け、UI で承認されるまで実行されません。

`getWeather` は許可済みの外部 API だけを呼ぶ read-only tool です。Dynamic Worker sandbox には自由な外部ネットワークを開けず、codemode からは `codemode.getWeather()` としてこの tool 経由で天気を取得します。

### 8. turn ごとに挙動を変える

`beforeTurn()` でチャット 1 ターンごとの追加 system context や利用可能ツールを制御します。

readonly mode では読み取り系ツールだけを `activeTools` に残します。

```ts
if (mode === "readonly") {
  return {
    system: `${ctx.system}\n\n${extra}`,
    activeTools: ["listTickets", "getTicket", "searchTickets", "codemode"]
  };
}
```

`beforeToolCall()` でも変更系ツールをブロックしています。UI 側の mode 指定だけに依存せず、サーバー側でも防御します。

構造化JSONモードでは `beforeTurn()` から AI SDK の `Output.object({ schema })` を返し、最終回答を JSON schema に沿って生成させます。このターンでは `activeTools: []` にして、tool 実行ではなく tenant snapshot を元にした最終整形に寄せています。

### 9. sub-agent を使う

`draftReplyWithSubAgent()` では `ReplyDraftAgent` を sub-agent として起動し、返信案作成だけを委譲します。

```ts
const child = await this.subAgent(ReplyDraftAgent, `reply-${ticketId}`);
await child.chat(task, callbacks, { tools: { saveDraft: tool({ ... }) } });
```

親 Agent はチケット取得と保存を担当し、子 Agent は返信文の生成に集中します。

### 10. Dynamic Worker / codemode を使う

この repo にはサンドボックス化されたコード実行が 2 種類あります。

- `codemode`: `createCodeTool()` と `DynamicWorkerExecutor` で、読み取り専用チケットツールだけを AI が JavaScript から呼べるようにする
- `getWeather`: codemode からも使える read-only 外部 API tool。sandbox で `fetch()` を直接使わせず、許可済み API だけをホスト側 tool として公開する
- `runDynamicWorkerTicketAnalytics`: `env.LOADER.get()` で再利用可能な Dynamic Worker をロードし、チケット配列を渡して集計する

どちらも `wrangler.jsonc` の `worker_loaders` binding を使います。

```jsonc
"worker_loaders": [
  {
    "binding": "LOADER"
  }
]
```

このデモでは `globalOutbound: null` を指定し、サンドボックスから外部ネットワークへ出られないようにしています。

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
