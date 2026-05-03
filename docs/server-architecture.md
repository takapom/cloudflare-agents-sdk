# Server Architecture

このアプリは Cloudflare Agents SDK を使うため、Agent は単なる controller ではなく、Durable Object として状態・RPC・ツール実行・ライフサイクルを持つ境界です。

基本方針は、Agent を「SDK との接続点」として薄く保ち、業務ルール、永続化、AI tool、業務外 capability を境界ごとに分けることです。

## 全体構成

```txt
src/
  server.ts
  shared/
    contracts.ts
  server/
    entrypoints/
      worker.ts
    platform/
      env.ts
      errors.ts
      time.ts
    agents/
      workspace/
        workspaceAgent.ts
        tools/
        prompts.ts
        toolPolicy.ts
      replyDraft/
        replyDraftAgent.ts
        prompts.ts
    ai/
    contexts/
      supportDesk/
        supportDeskContext.ts
        application/
          analytics/
          ticket/
          search/
        domain/
          ticket/
          search/
        infrastructure/
          analytics/
          ticket/
          search/
    capabilities/
      weather/
        application/
        domain/
        infrastructure/
```

## `src/server.ts`

Worker export の互換 entrypoint です。実際の request handling は `src/server/entrypoints/worker.ts` に委譲します。

責務:

- Durable Object class を re-export する
- UI 互換のために共有型を re-export する
- Worker default export を再公開する

置いてよいもの:

- `SupportDeskAgent` / `ReplyDraftAgent` の export
- shared contract の export
- entrypoint default export の再公開

置かないもの:

- HTTP routing
- SQL
- 業務ロジック
- zod schema
- AI tool 定義
- prompt
- demo data
- 外部 API 呼び出し

## `src/server/entrypoints/*`

Worker の実 entrypoint です。

責務:

- `fetch()` を公開する
- `/health` のような Worker レベルの HTTP route を処理する
- `routeAgentRequest()` に Agent request を渡す

置かないもの:

- SQL
- 業務ロジック
- AI tool 定義
- prompt
- 外部 API 呼び出し

## `src/shared/contracts.ts`

クライアントとサーバーで共有する contract です。

責務:

- UI と server の境界をまたぐ型を定義する
- Agent RPC の戻り値として UI が読む型を置く
- `TicketStatus`、`TicketPriority`、`TenantOverview`、`TicketView` などの共有表現を管理する

置いてよいもの:

- serializable な型
- union type
- DTO / view model
- filter 型

置かないもの:

- server-only 型
- SQLite row 型
- zod schema
- React component
- Cloudflare binding 型

## `src/server/platform/*`

Cloudflare runtime の共通基盤です。

責務:

- `Env` 型を定義する
- `AI`、`LOADER`、Durable Object namespace などの binding を表す
- runtime 共通の日時 helper、error helper を置く

置いてよいもの:

- Cloudflare binding 型
- binding 名の型情報
- `nowIso()`
- runtime error helper

置かないもの:

- binding を使った処理
- model 作成処理
- Agent 実装
- 業務ルール
- SQL

## `src/server/agents/*`

Cloudflare Agents SDK との接続点です。

責務:

- `Think` を継承した Agent class を定義する
- `@callable()` の公開メソッドを持つ
- `getTools()` で AI tool を登録する
- `beforeTurn()` / `beforeToolCall()` で実行時ポリシーを適用する
- `subAgent()` を使った Agent 間 orchestration を行う
- Agent state を更新する

置いてよいもの:

- SDK lifecycle hooks
- `@callable()` の薄い delegator
- tool handlers と application service の接続
- sub-agent 呼び出し
- readonly mode のような Agent 実行ポリシーの適用
- context / capability の composition root 呼び出し

置かないもの:

- SQL query の詳細
- テーブル作成 DDL
- demo data の実体
- 長い prompt 本文
- zod schema の詳細
- 外部 API の fetch 実装
- Dynamic Worker に渡すソース文字列
- Support Desk 業務ではない外部 capability の実装
- context infrastructure の個別組み立て

判断基準:

- Cloudflare Agents SDK を外したときに不要になる処理は `agents/`
- SDK を外しても残る業務処理は `contexts/*/application` か `domain`
- Agent が context を使う入口は `contexts/<context>/<context>Context.ts`
- capability ごとに `workspace/`、`replyDraft/`、将来的には `search/`、`ticket/`、`analytics/` のように切る

現状:

- `agents/workspace/workspaceAgent.ts`: UI chat の入口。互換性のため exported class 名は `SupportDeskAgent` のまま。
- `agents/workspace/tools/index.ts`: WorkspaceAgent が公開する tool set の合成地点。
- `agents/workspace/tools/ticketTools.ts`: ticket の read / mutation tool。
- `agents/workspace/tools/searchTools.ts`: semantic search tool。
- `agents/workspace/tools/weatherTools.ts`: weather capability を WorkspaceAgent に公開する tool。
- `agents/workspace/tools/analyticsTools.ts`: analytics tool。
- `agents/workspace/tools/draftTools.ts`: ReplyDraftAgent への委譲 tool。
- `agents/workspace/tools/codeModeTool.ts`: codemode tool。
- `agents/replyDraft/replyDraftAgent.ts`: 返信案作成 sub-agent。

## `src/server/contexts/supportDesk/domain/*`

Support Desk bounded context の domain 表現です。

責務:

- Support Desk 内の概念を表す
- DB row から UI/API view への変換を定義する
- demo seed の元データなど、ドメインサンプルを管理する

置いてよいもの:

- SQLite row 型
- mapper
- domain constant
- demo ticket data
- domain vocabulary
- capability ごとの domain 表現

置かないもの:

- SQL 実行
- Agent SDK への依存
- `fetch()`
- zod schema
- React 用 label

注意:

- `domain/ticket/`: ticket row、mapper、demo data。
- `domain/search/`: semantic search document、metadata、embedding model 定数。
- 現状の `demoTickets` はデモ用途なので `domain/ticket/` に置いている。production seed や fixture が増える場合は、`fixtures/` や `seed/` に切る選択肢もある。

## `src/server/contexts/supportDesk/application/*`

Support Desk bounded context の application service です。

責務:

- ユースケース単位の入口を定義する
- Agent と infrastructure の間に境界を作る
- `listTickets`、`getTicket`、`changeTicketStatus`、`addInternalNote` などのアプリケーション操作を表す

置いてよいもの:

- ユースケース関数
- repository / store の呼び出し
- 複数 repository をまたぐ処理
- 監査ログや状態更新を伴う業務操作の流れ
- capability ごとの application service

置かないもの:

- Cloudflare Agents SDK 固有の hook
- AI tool 定義
- HTTP routing
- raw SQL の大量記述
- UI label

判断基準:

- 「ユーザーが何をしたいか」を表す処理は application
- 「どう保存するか」は infrastructure
- 「Agent がいつ呼ぶか」は agents

現状:

- `application/ticket/ticketApplication.ts`: ticket / note / draft / tenant overview のユースケース。
- `application/search/semanticSearchService.ts`: semantic search / reindex / search index deletion のユースケース。
- `application/analytics/ticketAnalyticsService.ts`: ticket analytics のユースケース。

## `src/server/contexts/supportDesk/application/*/*Store.ts` and `*Ports.ts`

Application が必要とする interface です。小さい機能では必須ではありませんが、infrastructure への依存が application に漏れ始めたら切ります。

現状:

- `application/ticket/ticketStore.ts`: ticket 永続化の port。
- `application/search/searchPorts.ts`: embedding provider、search index、projection store の port。

## `src/server/contexts/supportDesk/infrastructure/*`

Support Desk bounded context の永続化・技術詳細です。

責務:

- SQLite schema を作成する
- SQL query を実行する
- repository / store としてデータを読み書きする
- audit log の永続化を扱う
- DB row を domain / view に変換する

置いてよいもの:

- `CREATE TABLE`
- `SELECT` / `INSERT` / `UPDATE` / `DELETE`
- SQLite の実装詳細
- persistence 向けの helper
- repository / store implementation
- Cloudflare binding の具体呼び出し
- Dynamic Worker の具体実行

置かないもの:

- Agent SDK hook
- prompt
- zod schema
- React UI の表示名
- 外部 API client

注意:

- `infrastructure/ticket/sqliteTicketStore.ts` は現時点では ticket / note / draft / audit log の store と repository の役割をまとめている。規模が大きくなったら `ticketRepository.ts`、`draftRepository.ts`、`auditLogRepository.ts` に分割する。
- `infrastructure/search/`: Workers AI embedding、Vectorize、search projection の具体実装。
- `infrastructure/analytics/dynamicWorkerTicketAnalytics.ts`: Support Desk ticket analytics の Dynamic Worker 実装。

## `src/server/contexts/supportDesk/supportDeskContext.ts`

Support Desk context の composition root です。

責務:

- ticket application、semantic search service、analytics service を組み立てる
- SQLite、Workers AI、Vectorize、Dynamic Worker の adapter を context 内で接続する
- Agent に対して `tickets`、`search`、`analytics` の業務 API を公開する

置かないもの:

- Agent SDK hook
- `tool()`
- prompt
- UI component

## `src/server/ai/*`

server 全体で共有する AI 基盤です。

責務:

- model provider を作成する
- model name を一箇所に集約する
- 複数 Agent で共有する AI adapter を置く

置いてよいもの:

- `createWorkersAI(...)`
- model constant
- provider factory

置かないもの:

- Support Desk 専用 prompt
- Support Desk 専用 tool
- 業務ロジック

## `src/server/capabilities/*`

特定の業務 bounded context には属さないが、Agent から利用できる能力の境界です。

`weather` のように Support Desk 業務そのものではない機能は、`contexts/supportDesk` に入れず capability として隔離します。

責務:

- 独立した能力の application / domain / infrastructure をまとめる
- 外部 API client を capability 内の infrastructure に閉じ込める
- Agent から呼び出しやすい application 関数を公開する
- 不要になったら capability 単位で削除できる状態を保つ

置いてよいもの:

- 業務 context に属さない application service
- capability 固有の domain 型
- 外部 API の具体実装
- `fetch()`、外部 API URL、外部 API response 型

置かないもの:

- Agent SDK hook
- Agent tool 定義
- SQL
- Support Desk の業務判断
- UI component

例:

- `weather/application/getWeather.ts`
- `weather/domain/weather.ts`
- `weather/infrastructure/openMeteoWeatherClient.ts`

## 変更時の判断基準

新しいコードを置く場所に迷ったら、変更理由で判断します。

| 変更理由 | 置き場所 |
| --- | --- |
| Worker の HTTP entrypoint を変える | `src/server/entrypoints/worker.ts` |
| Durable Object export / shared export を変える | `src/server.ts` |
| UI と server の共有型を変える | `src/shared/contracts.ts` |
| Cloudflare binding 型や runtime helper を変える | `src/server/platform/*` |
| Workspace Agent lifecycle / callable / tool orchestration を変える | `src/server/agents/workspace/workspaceAgent.ts` |
| Workspace Agent の tool を変える | `src/server/agents/workspace/tools/*` |
| weather capability を Agent tool としてどう公開するかを変える | `src/server/agents/workspace/tools/weatherTools.ts` |
| Workspace Agent の prompt を変える | `src/server/agents/workspace/prompts.ts` |
| Workspace Agent の readonly / mutating policy を変える | `src/server/agents/workspace/toolPolicy.ts` |
| 返信案 sub-agent を変える | `src/server/agents/replyDraft/replyDraftAgent.ts` |
| 返信案 sub-agent の prompt を変える | `src/server/agents/replyDraft/prompts.ts` |
| チケット業務のユースケースを変える | `contexts/supportDesk/application/ticket/ticketApplication.ts` |
| ticket application port を変える | `contexts/supportDesk/application/ticket/ticketStore.ts` |
| ticket SQLite の schema / query を変える | `contexts/supportDesk/infrastructure/ticket/sqliteTicketStore.ts` |
| ticket DB row や mapper を変える | `contexts/supportDesk/domain/ticket/*` |
| semantic search application を変える | `contexts/supportDesk/application/search/semanticSearchService.ts` |
| semantic search ports を変える | `contexts/supportDesk/application/search/searchPorts.ts` |
| semantic search domain を変える | `contexts/supportDesk/domain/search/searchDocument.ts` |
| embedding の具体実装を変える | `contexts/supportDesk/infrastructure/search/workersAiEmbeddingProvider.ts` |
| Vectorize の保存・検索実装を変える | `contexts/supportDesk/infrastructure/search/vectorizeTicketSearchIndex.ts` |
| search index の同期状態を変える | `contexts/supportDesk/infrastructure/search/sqliteSearchProjectionStore.ts` |
| Workers AI model を変える | `src/server/ai/model.ts` |
| 天気取得 capability のユースケースを変える | `src/server/capabilities/weather/application/getWeather.ts` |
| Open-Meteo 連携を変える | `src/server/capabilities/weather/infrastructure/openMeteoWeatherClient.ts` |
| 天気取得の戻り値やコード変換を変える | `src/server/capabilities/weather/domain/weather.ts` |
| Support Desk ticket analytics use case を変える | `contexts/supportDesk/application/analytics/ticketAnalyticsService.ts` |
| Support Desk ticket analytics の Dynamic Worker 実装を変える | `contexts/supportDesk/infrastructure/analytics/dynamicWorkerTicketAnalytics.ts` |

## 依存方向

推奨する依存方向:

```txt
server.ts
  -> entrypoints
  -> agents
entrypoints
  -> agents
agents
  -> contexts/*/<context>Context
  -> contexts/*/application
  -> capabilities/*/application
contexts/*/application
  -> contexts/*/infrastructure
  -> contexts/*/domain
  -> contexts/*/application ports
capabilities/*/application
  -> capabilities/*/infrastructure
  -> capabilities/*/domain
platform
shared/contracts
```

避ける依存:

- `domain` から `agents` へ依存する
- `infrastructure` から React / client へ依存する
- `shared` から server-only module へ依存する
- `server.ts` に bounded context の詳細を戻す
- `contexts/supportDesk` に Support Desk 業務ではない capability を混ぜる
- `agents` から context infrastructure を直接組み立てる

## 今後の分割目安

現時点では `agents/workspace/workspaceAgent.ts` の `SupportDeskAgent` ひとつを UI chat の入口にし、内部の bounded context は capability 別に分けている。

次の兆候が出たら Agent 分割を検討する。

- 返信案生成だけ独立した状態や履歴を持ちたい
- analytics が Support Desk 以外からも呼ばれる
- tenant operations と support ticket operations の権限や lifecycle が分かれる
- ticket 単位で長期状態、スケジュール、承認待ちを分離したい

候補:

```txt
WorkspaceAgent
TicketAgent
SearchAgent
ReplyDraftAgent
AnalyticsAgent
```

ただし、最初から Agent を増やしすぎると一覧取得や横断集計が複雑になる。まずは今のように「1 main Agent + bounded context 内部分割」を基本形にする。

## Semantic Search

semantic search は、チケット本文を embedding に変換して Vectorize に保存し、検索文も embedding に変換して近い vector を探す仕組みです。

責務の分担:

- `supportDeskContext.ts`: search application と infrastructure adapter を組み立てる
- `application/search/semanticSearchService.ts`: index / search / reindex のユースケースを組み立てる
- `application/search/searchPorts.ts`: embedding provider、search index、projection store の interface を定義する
- `domain/search/searchDocument.ts`: チケットを検索対象 document と metadata に変換する
- `infrastructure/search/workersAiEmbeddingProvider.ts`: Workers AI の `env.AI.run(...)` で embedding を作る
- `infrastructure/search/vectorizeTicketSearchIndex.ts`: Vectorize の `upsert` / `query` / `deleteByIds` を実行する
- `infrastructure/search/sqliteSearchProjectionStore.ts`: どの source がどの vectorId / contentHash で index 済みかを SQLite に保存する
- `agents/workspace/tools/searchTools.ts`: Agent tool として `semanticSearchTickets` / `reindexSearch` を公開する

重要な境界:

- Application 層は `env.AI.run(...)` や `env.SUPPORT_DESK_VECTORIZE.query(...)` を直接呼ばない
- Context 層は Agent tool / prompt / policy を持たない
- 具体的な Cloudflare binding 操作は infrastructure に閉じ込める
- Vectorize は source of truth ではなく検索 index として扱う
- チケット本体は Durable Object SQLite に残し、検索結果は `ticketId` で hydrate する
- `reindexSearch` は embedding quota を消費するため approval 必須の mutating tool とする

運用前提:

- Vectorize index は事前に Cloudflare 側で作成しておく
- 現在の embedding model は `@cf/baai/bge-base-en-v1.5`
- 想定 dimensions は `768`
- Vectorize index は `cosine` metric で作る

作成コマンド例:

```bash
npx wrangler vectorize create support-desk-tickets --dimensions=768 --metric=cosine
```

検索の流れ:

```txt
semanticSearchTickets(query)
  -> embeddingProvider.embed(query)
  -> vectorIndex.query(vector)
  -> ticketId で SQLite から ticket を取得
  -> score 付きで Agent に返す
```

index の流れ:

```txt
reindexSearch()
  -> ticket 一覧を取得
  -> SearchDocument に変換
  -> contentHash が同じなら skip
  -> embeddingProvider.embed(document.text)
  -> vectorIndex.upsert(...)
  -> projectionStore.markIndexed(...)
```
