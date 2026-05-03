 今のアーキテクチャは、かなりざっくり言うとこうです。

  Client
    -> Worker entrypoint
      -> Agents
        -> Contexts / Capabilities / Analytics
          -> Infrastructure
            -> Cloudflare bindings / external APIs

  全体像

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

  src/server.ts

  Worker の entrypoint です。

  責務:

  - HTTP request を受ける
  - /health を返す
  - routeAgentRequest() で Agent にルーティングする
  - Durable Object class を export する

  置かないもの:

  - SQL
  - 業務ロジック
  - tool 定義
  - prompt
  - 外部 API 呼び出し

  src/server/agents/*

  Cloudflare Agents SDK との接続層です。
  ここは「context / capability を Agent にどう見せるか」を決めます。

  責務:

  - Think を継承した Agent class
  - Agent state / lifecycle
  - @callable() RPC
  - getTools() で tool 公開
  - prompt
  - readonly / mutating policy
  - approval policy
  - sub-agent orchestration

  主な構成:

  agents/
    workspace/
      workspaceAgent.ts
      prompts.ts
      toolPolicy.ts
      tools/
        index.ts
        ticketTools.ts
        searchTools.ts
        weatherTools.ts
        analyticsTools.ts
        draftTools.ts
        codeModeTool.ts

    replyDraft/
      replyDraftAgent.ts
      prompts.ts

  tools/index.ts は合成だけです。
  weatherTools.ts のような個別 tool 定義は Agent 側に置きます。

  src/server/contexts/supportDesk/*

  Support Desk の bounded context です。
  ここが業務ロジック本体です。

  責務:

  - ticket 一覧、詳細、検索
  - internal note
  - status change
  - draft 保存
  - tenant overview
  - semantic search / reindex
  - Support Desk 業務として意味がある domain 表現

  構成:

  contexts/supportDesk/
    domain/
      ticket/
        rows.ts
        mappers.ts
        demoTickets.ts
      search/
        searchDocument.ts

    application/
      ticket/
        ticketApplication.ts
      search/
        semanticSearchService.ts

    infrastructure/
      ticket/
        sqliteTicketStore.ts
      search/
        workersAiEmbeddingProvider.ts
        vectorizeTicketSearchIndex.ts
        sqliteSearchProjectionStore.ts

  分担:

  - domain: 業務表現、row 型、mapper、search document
  - application: ユースケースの組み立て
  - infrastructure: SQLite、Workers AI、Vectorize の具体実装

  src/server/capabilities/*

  業務 context に属さない外部能力です。
  便利置き場ではなく、単一目的の外部 API adapter として扱います。

  今あるもの:

  capabilities/
    weather/
      application/
        getWeather.ts
      domain/
        weather.ts
      infrastructure/
        openMeteoWeatherClient.ts

  責務:

  - Open-Meteo を呼ぶ
  - city / timezone を正規化する
  - 天気結果をアプリ内の型に変換する

  置かないもの:

  - tool()
  - prompt
  - approval policy
  - ticket / customer / SLA / priority 判断
  - Support Desk の状態更新

  Weather を Agent tool としてどう公開するかは agents/workspace/tools/
  weatherTools.ts の責務です。

  contexts/supportDesk/application/analytics/*
  contexts/supportDesk/infrastructure/analytics/*

  Support Desk 固有の Dynamic Worker 分析処理です。

  責務:

  - ticket 配列を受け取って集計する use case を持つ
  - sandbox に渡す処理を supportDesk infrastructure に閉じ込める
  - analytics input を正規化する

  src/server/ai/*

  AI model provider の共通層です。

  責務:

  - Workers AI provider を作る
  - model name を集約する
  - Agent から使う model を返す

  今は model.ts。

  src/server/platform/env.ts

  Cloudflare binding の型定義です。

  責務:

  - Env 型
  - AI
  - SUPPORT_DESK_VECTORIZE
  - LOADER
  - Durable Object namespace

  ここでは binding を「使う」のではなく、「型として定義する」だけで
  す。

  src/shared/contracts.ts

  client / server 共有 contract です。

  責務:

  - UI が読む serializable な型
  - TicketStatus
  - TicketPriority
  - TicketView
  - TenantOverview
  - filter 型

  置かないもの:

  - server-only 型
  - SQL row 型
  - zod schema
  - Cloudflare binding 型

  依存方向

  client
    -> shared/contracts
    -> server.ts
      -> agents
        -> contexts/supportDesk/application
        -> capabilities/weather/application
        -> analytics
        -> ai

  context 内はこうです。

  application
    -> domain
    -> infrastructure

  capability 内もこうです。

  application
    -> domain
    -> infrastructure

  避けるべき依存はこれです。

  contexts/supportDesk -> agents
  capabilities/weather -> agents
  domain -> infrastructure
  shared -> server-only
  agents -> raw SQL / external fetch

  要するに、今の設計思想はこれです。

  contexts/supportDesk = 業務本体
  capabilities/weather = 業務外の外部能力本体
  agents/*             = それらを Agent にどう見せるか
  infrastructure       = Cloudflare / DB / 外部 API の具体実装
  shared               = client-server contract


› Write tests for @filename

  gpt-5.5 high · ~/Downloads/practice cf agents
