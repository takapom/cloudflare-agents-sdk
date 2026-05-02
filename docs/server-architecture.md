# Server Architecture

このアプリは Cloudflare Agents SDK を使うため、Agent は単なる controller ではなく、Durable Object として状態・RPC・ツール実行・ライフサイクルを持つ境界です。

基本方針は、Agent を「SDK との接続点」として薄く保ち、業務ルール、永続化、AI tool、外部 API を境界ごとに分けることです。

## 全体構成

```txt
src/
  server.ts
  shared/
    contracts.ts
  server/
    agents/
    ai/
    analytics/
    contexts/
      supportDesk/
        ai/
        application/
        domain/
        infrastructure/
    integrations/
    utils/
```

## `src/server.ts`

Worker の entrypoint です。

責務:

- `fetch()` を公開する
- `/health` のような Worker レベルの HTTP route を処理する
- `routeAgentRequest()` に Agent request を渡す
- Durable Object class を re-export する
- UI 互換のために共有型を re-export する

置いてよいもの:

- Worker entrypoint
- Worker 全体に関わる軽い HTTP routing
- `SupportDeskAgent` / `ReplyDraftAgent` の export

置かないもの:

- SQL
- 業務ロジック
- zod schema
- AI tool 定義
- prompt
- demo data
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

## `src/server/env.ts`

Cloudflare binding の型定義です。

責務:

- `Env` 型を定義する
- `AI`、`LOADER`、Durable Object namespace などの binding を表す

置いてよいもの:

- Cloudflare binding 型
- binding 名の型情報

置かないもの:

- binding を使った処理
- model 作成処理
- Agent 実装

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

置かないもの:

- SQL query の詳細
- テーブル作成 DDL
- demo data の実体
- 長い prompt 本文
- zod schema の詳細
- 外部 API の fetch 実装
- Dynamic Worker に渡すソース文字列

判断基準:

- Cloudflare Agents SDK を外したときに不要になる処理は `agents/`
- SDK を外しても残る業務処理は `contexts/*/application` か `domain`

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

置かないもの:

- SQL 実行
- Agent SDK への依存
- `fetch()`
- zod schema
- React 用 label

注意:

- 現状の `demoTickets` はデモ用途なのでここに置いている。production seed や fixture が増える場合は、`fixtures/` や `seed/` に切る選択肢もある。

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

置かないもの:

- Agent SDK hook
- prompt
- zod schema
- React UI の表示名
- 外部 API client

注意:

- `sqliteSupportDeskStore.ts` は現時点では store と repository の役割をまとめている。規模が大きくなったら `ticketRepository.ts`、`draftRepository.ts`、`auditLogRepository.ts` に分割する。

## `src/server/contexts/supportDesk/ai/*`

Support Desk bounded context の AI 境界です。

責務:

- AI tool の定義を管理する
- tool input の zod schema を定義する
- structured output schema を定義する
- system prompt / user prompt を管理する
- readonly tool / mutating tool などの tool policy を管理する

置いてよいもの:

- `tool(...)`
- zod schema
- prompt template
- tool description
- tool allow/block policy

置かないもの:

- SQL
- SQLite schema
- 外部 API の fetch 実装
- React 表示 label
- Agent state の更新処理

判断基準:

- LLM の入出力や tool selection に関係するものは `ai/`
- 業務操作そのものは `application`
- 保存方法は `infrastructure`

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

## `src/server/analytics/*`

分析処理の境界です。

責務:

- Dynamic Worker を使った分析処理をまとめる
- 分析用 sandbox に渡す source code を管理する
- 分析 input の正規化を行う

置いてよいもの:

- Dynamic Worker loader の呼び出し
- analytics worker source
- ranking / aggregation logic
- analytics input normalization

置かないもの:

- Support Desk の更新系処理
- Agent SDK hook
- UI label

注意:

- 分析が Support Desk 固有のままなら `contexts/supportDesk/analytics` に寄せてもよい。将来、複数 context から使うなら今の `server/analytics` のままでよい。

## `src/server/integrations/*`

外部サービス連携の境界です。

責務:

- 外部 API client を実装する
- 外部 API の response shape を扱う
- 外部 API 固有の error handling を閉じ込める

置いてよいもの:

- `fetch()`
- 外部 API URL
- 外部 API response 型
- provider 固有の変換処理

置かないもの:

- Agent SDK hook
- SQL
- Support Desk の業務判断
- UI component

例:

- `openMeteo/client.ts`
- `openMeteo/weatherCodes.ts`

## `src/server/utils/*`

server 内で共有する小さな汎用 helper です。

責務:

- bounded context に属さない小さな処理を置く
- 日時、エラー判定などの汎用関数を提供する

置いてよいもの:

- `nowIso()`
- 汎用 error helper
- 小さな pure function

置かないもの:

- 業務ルール
- Agent SDK hook
- SQL
- prompt

## 変更時の判断基準

新しいコードを置く場所に迷ったら、変更理由で判断します。

| 変更理由 | 置き場所 |
| --- | --- |
| Worker の HTTP entrypoint を変える | `src/server.ts` |
| UI と server の共有型を変える | `src/shared/contracts.ts` |
| Agent lifecycle / callable / tool orchestration を変える | `src/server/agents/*` |
| チケット業務のユースケースを変える | `contexts/supportDesk/application/*` |
| SQLite の schema / query を変える | `contexts/supportDesk/infrastructure/*` |
| DB row や mapper を変える | `contexts/supportDesk/domain/*` |
| AI tool の input schema を変える | `contexts/supportDesk/ai/schemas.ts` |
| AI tool の登録や description を変える | `contexts/supportDesk/ai/tools.ts` |
| prompt を変える | `contexts/supportDesk/ai/prompts.ts` |
| readonly / mutating tool policy を変える | `contexts/supportDesk/ai/toolPolicy.ts` |
| Workers AI model を変える | `src/server/ai/model.ts` |
| Open-Meteo 連携を変える | `src/server/integrations/openMeteo/*` |
| Dynamic Worker 分析を変える | `src/server/analytics/*` |

## 依存方向

推奨する依存方向:

```txt
server.ts
  -> agents
    -> application
      -> infrastructure
      -> domain
    -> ai
    -> integrations
    -> analytics
shared/contracts
```

避ける依存:

- `domain` から `agents` へ依存する
- `infrastructure` から React / client へ依存する
- `shared` から server-only module へ依存する
- `server.ts` に bounded context の詳細を戻す

## 今後の分割目安

現時点では `SupportDeskAgent` ひとつを中心に、内部を bounded context で分けている。

次の兆候が出たら Agent 分割を検討する。

- 返信案生成だけ独立した状態や履歴を持ちたい
- analytics が Support Desk 以外からも呼ばれる
- tenant operations と support ticket operations の権限や lifecycle が分かれる
- ticket 単位で長期状態、スケジュール、承認待ちを分離したい

候補:

```txt
SupportDeskAgent
ReplyDraftAgent
TenantOpsAgent
AnalyticsAgent
TicketAgent
```

ただし、最初から Agent を増やしすぎると一覧取得や横断集計が複雑になる。まずは今のように「1 main Agent + bounded context 内部分割」を基本形にする。
