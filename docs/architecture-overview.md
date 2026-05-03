# Architecture Overview

このアプリは Cloudflare Agents SDK と Cloudflare Think を使った Support Desk Agent デモです。

設計の中心は、Cloudflare Agent を「実行主体」として扱い、業務ロジックを `contexts/supportDesk` に閉じ込めることです。Agent は prompt、tool、approval policy、sub-agent orchestration を持ちますが、ticket の業務判断や永続化の詳細は持ちません。

## 全体像

```txt
                         Browser / React UI
                                |
                                | useAgent / useAgentChat / callable RPC
                                v
                    +---------------------------+
                    | Cloudflare Worker         |
                    | src/server.ts             |
                    +-------------+-------------+
                                  |
                                  | routeAgentRequest()
                                  v
                    +---------------------------+
                    | WorkspaceAgent            |
                    | agents/workspace          |
                    |                           |
                    | - state / lifecycle       |
                    | - prompt                  |
                    | - tool policy             |
                    | - tool exposure           |
                    | - sub-agent orchestration |
                    +------+------+-------------+
                           |      |
            support desk   |      | external / utility capability
            use cases      |      |
                           v      v
          +-------------------+  +--------------------+
          | contexts/         |  | capabilities/      |
          | supportDesk       |  | weather            |
          +---------+---------+  +---------+----------+
                    |                      |
                    v                      v
          +-------------------+  +--------------------+
          | Durable Object    |  | Open-Meteo API     |
          | SQLite / AI /     |  | via fetch()        |
          | Vectorize         |  +--------------------+
          +-------------------+
```

## レイヤー責務

```txt
src/server.ts
  Worker の互換 entrypoint。実処理は entrypoints/worker.ts に委譲する。

src/server/entrypoints/*
  Worker entrypoint。HTTP request を Agent に渡すだけ。

src/server/platform/*
  Cloudflare runtime の共通基盤。
  Env 型、日時、エラー判定などを置く。

src/server/agents/*
  Cloudflare Agents SDK の境界。
  Agent class、prompt、tool、approval policy、sub-agent 呼び出しを持つ。

src/server/contexts/supportDesk/*
  Support Desk 業務の bounded context。
  ticket、note、draft、status、semantic search、ticket analytics など業務として意味があるものを持つ。

src/server/capabilities/*
  業務 context に属さない外部能力。
  weather のような単一目的の外部 API adapter を薄く包む。

src/server/ai/*
  Workers AI model provider の作成。

src/shared/*
  client / server 間で共有する serializable contract。
```

## 依存方向

依存は上から下に流します。逆向きにすると Agent SDK、DB、業務ロジックが混ざります。

```txt
client
  |
  v
server.ts
  |
  v
agents
  |----------------------|
  v                      v
contexts/supportDesk    capabilities/weather
  |                      |
  v                      v
infrastructure          external API
  |
  v
Cloudflare bindings
```

禁止する依存:

- `contexts/supportDesk` から `agents` へ依存する
- `domain` から `infrastructure` へ依存する
- `shared` から server-only module へ依存する
- `capabilities` に Support Desk 業務判断を入れる
- `agents` に SQL や外部 API の具体実装を置く

## Agent と Context の関係

`WorkspaceAgent` は Support Desk 業務そのものではありません。Cloudflare Agents SDK 上で動く実行主体です。

```txt
WorkspaceAgent
  |
  | exposes tools:
  | - listTickets
  | - getTicket
  | - semanticSearchTickets
  | - addInternalNote
  | - changeTicketStatus
  | - draftReplyWithSubAgent
  | - getWeather
  |
  v
supportDesk application services
  |
  | owns business use cases:
  | - ticket list / search
  | - internal note
  | - status change
  | - semantic search / reindex
  | - ticket analytics
  |
  v
supportDesk infrastructure
```

Agent が tool を公開し、tool handler が context の application service を呼びます。Context は Agent の存在を知りません。

## Tool の置き場所

Tool は Agent の外向き interface なので `agents/workspace/tools` に置きます。

```txt
agents/workspace/tools/
  index.ts
    WorkspaceAgent が公開する tool set を合成する

  ticketTools.ts
    ticket の read / mutation tool

  searchTools.ts
    semantic search / reindex tool

  weatherTools.ts
    weather capability を WorkspaceAgent に公開する tool

  analyticsTools.ts
    Dynamic Worker analytics tool

  draftTools.ts
    ReplyDraftAgent への委譲 tool

  codeModeTool.ts
    codemode tool
```

Tool に置いてよいもの:

- `tool()`
- `inputSchema`
- `needsApproval`
- tool description
- handler への委譲

Tool に置かないもの:

- SQL
- ticket の業務判断
- embedding / Vectorize の具体呼び出し
- Open-Meteo への `fetch()`
- 長い prompt

Capability 由来の tool も、capability 側ではなく公開する Agent 側に置きます。

```txt
capabilities/weather/*
  weather の能力本体

agents/workspace/tools/weatherTools.ts
  WorkspaceAgent が weather をどう tool として見せるか
```

`agents/workspace/tools/index.ts` は tool 定義を書かず、各 tool module を合成するだけにします。

## Support Desk Context

Support Desk はこのアプリの主業務 context です。

```txt
contexts/supportDesk/
  supportDeskContext.ts

  domain/
    ticket/
      rows.ts
      mappers.ts
      demoTickets.ts
    search/
      searchDocument.ts

  application/
    analytics/
      ticketAnalyticsService.ts
    ticket/
      ticketApplication.ts
      ticketStore.ts
    search/
      semanticSearchService.ts
      searchPorts.ts

  infrastructure/
    analytics/
      dynamicWorkerTicketAnalytics.ts
    ticket/
      sqliteTicketStore.ts
    search/
      workersAiEmbeddingProvider.ts
      vectorizeTicketSearchIndex.ts
      sqliteSearchProjectionStore.ts
```

`supportDeskContext.ts` は context 内の composition root です。Agent はここを入口にし、SQLite、Workers AI、Vectorize、Dynamic Worker の具体的な組み立ては context 内に閉じ込めます。

`domain` は業務表現、`application` はユースケース、`ports` は差し替え可能な interface、`infrastructure` は SQLite、Workers AI、Vectorize、Dynamic Worker などの具体実装です。

## Capability の扱い

`capabilities` は便利置き場ではありません。特定業務に属さない単一目的の外部能力だけを置きます。

```txt
capabilities/weather/
  application/
    getWeather.ts
  domain/
    weather.ts
  infrastructure/
    openMeteoWeatherClient.ts
```

`weather` の責務はここまでです。

```txt
city を受け取る
  -> Open-Meteo に問い合わせる
  -> 現在天気として正規化する
  -> 呼び出し元に返す
```

`capabilities/weather` に置かないもの:

- `tool()`
- prompt
- approval policy
- ticket / customer / SLA / priority の判断
- Support Desk の状態更新

天気を tool としてどう公開するかは `agents/workspace/tools/weatherTools.ts` の責務です。`agents/workspace/tools/index.ts` はそれを WorkspaceAgent の tool set に合成するだけです。

## Semantic Search の流れ

```txt
User asks similar ticket search
  |
  v
WorkspaceAgent
  |
  v
semanticSearchTickets tool
  |
  v
contexts/supportDesk/application/search/semanticSearchService.ts
  |
  |-- query text
  |     |
  |     v
  |   workersAiEmbeddingProvider.ts
  |     env.AI.run(...)
  |
  |-- embedding vector
  |     |
  |     v
  |   vectorizeTicketSearchIndex.ts
  |     env.SUPPORT_DESK_VECTORIZE.query(...)
  |
  |-- matched ticketId
        |
        v
      sqliteTicketStore.ts
        hydrate ticket from Durable Object SQLite
```

Application 層は `env.AI.run(...)` や `env.SUPPORT_DESK_VECTORIZE.query(...)` を直接呼びません。具体実装は infrastructure に閉じ込めます。

## Reply Draft の流れ

```txt
User asks draft reply for T-1002
  |
  v
WorkspaceAgent
  |
  | get ticket from supportDesk context
  v
ReplyDraftAgent sub-agent
  |
  | generate reply draft
  v
saveDraft tool passed by parent
  |
  v
supportDesk application
  |
  v
Durable Object SQLite
```

親 Agent は ticket 取得と保存を担当します。`ReplyDraftAgent` は返信文生成に集中します。

## Weather の流れ

```txt
User asks weather
  |
  v
WorkspaceAgent
  |
  v
getWeather tool
  |
  v
capabilities/weather/application/getWeather.ts
  |
  v
capabilities/weather/infrastructure/openMeteoWeatherClient.ts
  |
  v
Open-Meteo API
```

Weather は Support Desk context には入りません。Support Desk の業務判断ではなく、Agent が使える外部 capability です。

## 配置判断のルール

```txt
Cloudflare Agents SDK の hook / state / tool / prompt
  -> agents/*

ticketId / customer / SLA / priority / status が出る業務ロジック
  -> contexts/supportDesk/*

SQLite / Workers AI / Vectorize の具体呼び出し
  -> contexts/supportDesk/infrastructure/*

業務外の外部 API adapter
  -> capabilities/*

client と server で共有する serializable 型
  -> shared/*
```

迷ったら、コードから Cloudflare Agents SDK を外しても意味が残るかを見ます。残るなら `contexts` か `capabilities`、残らないなら `agents` です。
