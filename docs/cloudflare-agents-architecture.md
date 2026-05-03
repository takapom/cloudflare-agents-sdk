# Cloudflare Agents Architecture

このドキュメントは、このアプリ固有ではなく、Cloudflare Agents SDK を使うアプリ全般で使い回せるアーキテクチャ方針をまとめます。

Cloudflare Agents では Agent や Tool を簡単に増やせますが、最初に決めるべきものは実行主体ではなく業務境界です。新しい機能はまず「どの業務の言葉で説明できるか」を見て、既存 context に入れるのか、新しい context として独立させるのか、業務外の外部能力として capability に切るのかを判断します。

Agent は業務そのものではなく、context や capability を AI にどう見せるかを決める actor です。Tool はその公開口です。業務判断は context に置き、外部 API との接続は capability や infrastructure に閉じ込め、Agent はそれらを組み合わせる入口として薄く保ちます。

## 基本思想

```txt
Agent
  Cloudflare 上で動く actor。
  state、lifecycle、prompt、tool、policy、sub-agent orchestration を持つ。

Tool
  Agent が context / capability を AI に公開する interface。
  tool name、input schema、description、approval policy を持つ。

Context
  業務 bounded context。
  業務判断、domain model、application use case、repository port、infrastructure を持つ。

Capability
  アプリ全体で再利用できる、業務非依存の外部能力 adapter。
  Slack、Calendar、Email、Weather、Storage など外部 API / SDK を薄く包む。

Workflow
  Agent の 1 turn に閉じない長い処理、非同期処理、定期処理。

Projection
  読み取り最適化、横断集計、管理画面向け read model。

Platform
  Cloudflare runtime の共通基盤。
  Env 型、binding 型、logger、error、time helper など。
```

## 全体像

```txt
Browser / React UI
  |
  | useAgent / useAgentChat / callable RPC
  v
src/server.ts
  |
  | routeAgentRequest()
  v
agents/workspace/WorkspaceAgent
  |
  | exposes tools / callable methods
  |------------------------------|
  v                              v
contexts/supportDesk             capabilities/weather
  |                              |
  v                              v
SQLite / Workers AI / Vectorize  Open-Meteo API
```

汎用化すると、次の対応関係です。

```txt
src/server.ts
  -> Worker entrypoint

agents/workspace/WorkspaceAgent
  -> Main Agent / actor

contexts/supportDesk
  -> Business Context

capabilities/weather
  -> External Capability

SQLite / Workers AI / Vectorize
  -> Cloudflare Bindings used by context infrastructure

Open-Meteo API
  -> External API used by capability infrastructure
```

依存方向は上から下です。`contexts` や `capabilities` が `agents` を知る形にしません。

```txt
agents
  -> contexts/*/<context>Context
  -> contexts/*/application
  -> capabilities/*/application
  -> workflows

contexts/*/application
  -> contexts/*/domain
  -> contexts/*/ports
  -> contexts/*/infrastructure
  -> capabilities/*/application when needed

capabilities/*/application
  -> capabilities/*/domain
  -> capabilities/*/infrastructure

workflows
  -> contexts/*/application
  -> capabilities/*/application
  -> projections
```

避ける依存:

- `contexts/*` から `agents/*` へ依存する
- `capabilities/*` から `agents/*` へ依存する
- `capabilities/*` から `contexts/*` へ依存する
- `domain` から `infrastructure` へ依存する
- `shared` から server-only module へ依存する
- `agents/*` に raw SQL、外部 API の `fetch()`、Cloudflare binding の具体操作を置く

## 汎用ディレクトリ

```txt
src/server/
  entrypoints/
    worker.ts

  platform/
    env.ts
    bindings.ts
    logger.ts
    errors.ts
    time.ts

  agents/
    workspace/
      workspaceAgent.ts
      state.ts
      prompts.ts
      policies.ts
      tools/
        index.ts
        <feature>Tools.ts

    <specialistAgent>/
      <specialistAgent>.ts
      prompts.ts
      policies.ts
      tools/

  contexts/
    <businessContext>/
      <businessContext>Context.ts
      <feature>/
        domain/
        application/
        ports/
        infrastructure/

  capabilities/
    <externalCapability>/
      domain/
      application/
      infrastructure/

  workflows/
    <workflowName>/

  projections/
    <projectionName>/

  shared/
    contracts/
```

小さいうちは `contexts/<context>/domain`、`application`、`infrastructure` のように layer-first でもよいです。機能が増えたら `contexts/<context>/<feature>/domain` の feature-first に寄せます。

## レイヤー責務

### `entrypoints/`

Worker の入口です。

責務:

- HTTP request を受ける
- `routeAgentRequest()` に渡す
- health check を返す
- 必要なら static asset / client serving を扱う

置かないもの:

- 業務ロジック
- Tool 定義
- prompt
- SQL
- 外部 API 呼び出し

### `platform/`

Cloudflare Workers 実行環境の共通基盤です。

責務:

- `Env` 型
- binding 型
- logger
- error helper
- time helper
- runtime 共通処理

置かないもの:

- `env.AI.run(...)` のようなユースケース固有の具体呼び出し
- Vectorize / D1 / R2 の業務向け repository 実装
- Agent tool
- 業務判断

Cloudflare binding を「定義」するのは `platform` でよいですが、binding を「業務目的で使う」のは context / capability の infrastructure です。

### `agents/`

Cloudflare Agents SDK の actor layer です。

責務:

- Agent class
- Agent state
- lifecycle hook
- prompt
- callable method
- tool 公開
- approval policy
- readonly / admin / quota policy
- sub-agent orchestration

置かないもの:

- SQL
- 外部 API の `fetch()`
- embedding / Vectorize の具体呼び出し
- 業務判断の本体
- DB schema

Agent は「業務を実装する場所」ではなく「業務や外部能力を AI にどう見せるか」を決める場所です。

### `agents/<agent>/tools/`

Agent の外向き interface です。

責務:

- `tool()`
- `inputSchema`
- tool description
- `needsApproval`
- handler への委譲
- tool metadata

Tool は capability 側ではなく、その Tool を公開する Agent 側に置きます。

```txt
capabilities/slack/*
  Slack API を呼ぶ能力本体

agents/workspace/tools/slackTools.ts
  WorkspaceAgent が Slack をどう Tool として見せるか
```

`tools/index.ts` は合成だけにします。

```txt
tools/index.ts
  createTicketTools(...)
  createSearchTools(...)
  createSlackTools(...)
  createWeatherTools(...)
```

`index.ts` に個別 Tool の `tool()` 定義を直接書き始めたら、分割のサインです。

### `contexts/`

業務 bounded context です。

責務:

- 業務語彙
- domain model
- business rule
- application use case
- repository / service port
- infrastructure adapter

例:

```txt
contexts/supportDesk
contexts/customer
contexts/billing
contexts/knowledgeBase
contexts/customerSuccess
```

新機能を入れる前に、まず「既存 context に本当に属するか」を判断します。

```txt
urgent ticket を検知する
  -> supportDesk

顧客の契約プランを管理する
  -> customer / billing

問い合わせ返信に使うナレッジを管理する
  -> knowledgeBase
```

`<businessContext>Context.ts` は context 内の composition root です。Agent はここを入口にし、application service と infrastructure adapter の組み立ては context 内に閉じ込めます。

```txt
agents/workspace
  -> contexts/supportDesk/supportDeskContext.ts
    -> application
    -> infrastructure
```

Agent が context infrastructure を個別に import し始めたら、composition root に寄せます。

### `contexts/<context>/domain/`

業務表現です。

責務:

- entity / value object
- domain type
- domain rule
- mapper
- business vocabulary

置かないもの:

- Agent SDK
- `tool()`
- raw SQL
- `fetch()`
- Cloudflare binding

### `contexts/<context>/application/`

業務ユースケースの入口です。

責務:

- 「ユーザーが何をしたいか」を表す use case
- domain と infrastructure の組み合わせ
- transaction / consistency の単位
- workflow への enqueue
- capability の呼び出し

Agent は基本的に application を入口に context を使います。

```txt
Agent tool
  -> context application use case
    -> domain
    -> ports / infrastructure
```

Agent が `infrastructure` を直接触るのは避けます。

### `contexts/<context>/ports/`

Application が必要とする interface です。

責務:

- repository interface
- external service interface
- embedding provider interface
- search index interface

本格的にスケールするなら ports を切ります。

```txt
application/
  semanticSearchService.ts
ports/
  embeddingProvider.ts
  searchIndex.ts
infrastructure/
  workersAiEmbeddingProvider.ts
  vectorizeSearchIndex.ts
```

### `contexts/<context>/infrastructure/`

Cloudflare binding や DB の具体実装です。

責務:

- Durable Object SQLite
- D1
- R2
- KV
- Queue
- Vectorize
- Workers AI
- repository implementation
- external service adapter when context-specific

ここでは `env.DB.prepare(...)`、`env.AI.run(...)`、`env.VECTORIZE.query(...)` のような具体呼び出しを持ってよいです。

### `capabilities/`

アプリ全体で再利用できる、業務非依存の外部能力 adapter です。

責務:

- 外部 API / SDK の呼び出し
- 外部 API response の正規化
- provider 固有 error handling
- capability 固有の最小 domain 型
- application 関数として公開

例:

```txt
capabilities/weather
capabilities/slack
capabilities/calendar
capabilities/email
capabilities/github
capabilities/storage
capabilities/embedding
```

置かないもの:

- Agent tool
- prompt
- approval policy
- 業務判断
- context 固有の状態更新

例えば Slack の場合:

```txt
capabilities/slack
  Slack API に message を送る

contexts/supportDesk/escalation
  urgent ticket をどの channel に通知するか判断する

agents/workspace/tools/escalationTools.ts
  escalation use case を AI にどう見せるか決める
```

### `workflows/`

Agent の 1 turn に閉じない処理です。

責務:

- Queue consumer
- Cron Trigger
- 長い非同期処理
- retry
- backoff
- 複数 context / capability をまたぐ orchestration

例:

```txt
workflows/searchIndexing
workflows/notificationDelivery
workflows/reportGeneration
workflows/ticketEscalation
```

Agent の応答中に重い処理を完結させず、必要なら workflow に逃がします。

### `projections/`

読み取り最適化、横断集計、管理画面向け read model です。

責務:

- tenant-local state から global read model を作る
- D1 / Analytics Engine / R2 へ集計結果を保存する
- dashboard 用の projection を更新する

Durable Object SQLite は tenant-local には強いですが、global view には弱いです。

```txt
Durable Object SQLite
  -> domain event
  -> Queue
  -> projection
  -> D1 / Analytics Engine / R2
```

### `shared/`

client / server 間で共有する serializable contract です。

責務:

- DTO
- view model
- filter type
- Agent state の public representation

置かないもの:

- server-only 型
- SQLite row 型
- Cloudflare binding 型
- `tool()`
- zod schema の肥大化した集合

## 新機能追加時の判断手順

```txt
1. まず context boundary を決める
   |
   |-- 既存 context に属するか？
   |-- 新しい context か？
   |-- 業務外 capability か？
   |-- platform / shared / utils か？

2. 業務 use case を application に置く
   |
   |-- domain rule は domain
   |-- interface は ports
   |-- Cloudflare binding の具体実装は infrastructure

3. 外部能力が必要なら capability を呼ぶ
   |
   |-- capability には業務判断を入れない

4. AI に使わせる必要があるなら Agent tool を作る
   |
   |-- agents/<agent>/tools/<feature>Tools.ts
   |-- inputSchema / description / approval policy

5. 長い処理なら workflow に逃がす
   |
   |-- Queue / Cron / retry / projection

6. 横断参照が必要なら projection を作る
```

## スケール時の手順

### Step 1: Context boundary を見直す

最初に見るのは Agent ではなく context です。

```txt
この機能は本当に既存 context に入るか？
別 context として独立すべきか？
外部 capability にすべきか？
```

ここを間違えると、後から Tool や Agent を整理しても業務境界は直りません。

### Step 2: Main Agent を薄くする

Main Agent は会話入口と orchestration に寄せます。

```txt
WorkspaceAgent
  = user conversation
  = state
  = prompt
  = tool exposure
  = policy
  = sub-agent orchestration
```

業務処理は context application に逃がします。

### Step 3: Tool metadata を導入する

Tool が増えたら、単純な readonly / mutating 配列では足りなくなります。

```txt
tool metadata
  name
  mode: readonly | mutation
  approval: none | required
  access: tenant-user | admin
  sideEffect: none | external | quota-consuming
  scope: tenant | global
```

これを `beforeTurn()`、`beforeToolCall()`、approval UI、audit log で共通利用します。

### Step 4: Context を feature-first に寄せる

context 内の機能が増えたら、feature 単位で `domain/application/ports/infrastructure` を持たせます。

```txt
contexts/supportDesk/
  ticket/
    domain/
    application/
    ports/
    infrastructure/
  search/
    domain/
    application/
    ports/
    infrastructure/
  sla/
    domain/
    application/
    ports/
    infrastructure/
```

目安:

- use case が 5 個以上に増えた
- domain 語彙が明確に分かれた
- 別 Agent から独立して使いたくなった
- 変更理由が feature ごとに分かれた

### Step 5: 長い処理を workflow 化する

Agent の 1 turn に重い処理を入れ続けないようにします。

```txt
Before:
  ticket update
    -> embedding
    -> Vectorize upsert
    -> response

After:
  ticket update
    -> mark dirty
    -> Queue
    -> searchIndexing workflow
    -> Vectorize upsert
    -> projection update
```

### Step 6: Projection を作る

tenant-local な Durable Object SQLite だけでは、横断集計に弱いです。

必要になったら read model を外に出します。

```txt
Tenant Durable Object
  -> event
  -> Queue
  -> D1 / Analytics Engine / R2
  -> admin dashboard
```

目安:

- 全 tenant 横断検索が必要
- global dashboard が必要
- 分析履歴が必要
- tenant をまたいだレポートが必要

### Step 7: Specialist Agent を切る

Agent 分割は最後寄りでよいです。状態、権限、承認、スケジュール、Tool 集合が独立してから切ります。

```txt
agents/
  workspace/
    WorkspaceAgent
  search/
    SearchAgent
  replyDraft/
    ReplyDraftAgent
  analytics/
    AnalyticsAgent
  operations/
    OperationsAgent
```

目安:

- 1 Agent の Tool が 15 個を超える
- prompt が Tool 説明で肥大化する
- approval policy が機能ごとに違う
- 独立した長期 state / schedule が必要
- ある機能だけ別の会話履歴を持ちたい

## 配置チートシート

```txt
Cloudflare Agents SDK hook / state / prompt / tool / policy
  -> agents/*

AI にどう見せるか
  -> agents/<agent>/tools/*

業務判断
  -> contexts/<context>/*

業務 use case
  -> contexts/<context>/<feature>/application/*

context 内の composition root
  -> contexts/<context>/<context>Context.ts

業務表現
  -> contexts/<context>/<feature>/domain/*

repository / external service interface
  -> contexts/<context>/<feature>/ports/*

Cloudflare binding の具体呼び出し
  -> contexts/<context>/<feature>/infrastructure/*

業務非依存の外部 API adapter
  -> capabilities/<capability>/*

長い処理 / retry / queue / cron
  -> workflows/*

横断集計 / read model
  -> projections/*

client / server 共有 contract
  -> shared/contracts/*
```

## 最重要ルール

```txt
まず context boundary を決める。
次に use case を application に置く。
外部能力は capability に隔離する。
AI への公開方法は Agent tool に置く。
重い処理は workflow に逃がす。
横断参照は projection に逃がす。
Agent 分割は状態・権限・承認・Tool 集合が独立してから行う。
```
