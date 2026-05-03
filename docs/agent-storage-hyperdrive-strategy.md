# Agent Storage Hyperdrive Strategy

このドキュメントは、Cloudflare Agents の各 Agent インスタンスが持つ SQLite と、D1 の容量制限を前提に、会話履歴・tool log・長期メモリを Hyperdrive 経由の外部 DB へ逃がす方針を整理するための議論メモです。

ここでは実装を確定しきるのではなく、現時点で合意した方向性、削除タイミング、未決定の論点を分けて残します。

## 背景

Cloudflare Agents の Agent state / SQLite、および D1 は、いずれも「無制限の長期ストレージ」として使うには容量上限がある。D1 をグローバル DB として使っても DB 単位の上限が残るため、全 Agent の会話履歴や tool log を集約する永続ストアとしては将来的に詰まりやすい。

そのため、巨大化するデータは Hyperdrive 経由で外部 PostgreSQL / MySQL に保存する。Agent SQLite や D1 は、主ストレージではなく短期キャッシュ、同期制御、復旧用 state として扱う。

重要な前提:

- Hyperdrive は SQLite の置き換え先ではない。
- Hyperdrive は Workers から外部 PostgreSQL / MySQL に接続するための接続プール・高速化レイヤーである。
- Agent の `this.sql` をそのまま Hyperdrive に差し替えることはできない。
- 容量突破は「ローカル DB を拡張する」のではなく「保存責務を外部 DB に移す」ことで実現する。

## 決定済みの方向性

Agent SQLite / D1 は制御プレーン、Hyperdrive 先 DB はデータプレーンとして分ける。

```txt
┌──────────────────────────────────────────────────────────────┐
│ Agent instance                                                │
│                                                              │
│  ┌──────────────────────────────┐                            │
│  │ Local SQLite / small DB       │                            │
│  │                              │                            │
│  │ - current state              │                            │
│  │ - recent cache               │                            │
│  │ - outbox                     │                            │
│  │ - sync cursor                │                            │
│  │ - GC cursor                  │                            │
│  └───────────────┬──────────────┘                            │
│                  │                                           │
│                  │ Hyperdrive                                │
│                  v                                           │
│  ┌──────────────────────────────┐                            │
│  │ External PostgreSQL / MySQL   │                            │
│  │                              │                            │
│  │ - full conversation history  │                            │
│  │ - full tool logs             │                            │
│  │ - run events                 │                            │
│  │ - long-term memory           │                            │
│  │ - audit data                 │                            │
│  └──────────────────────────────┘                            │
└──────────────────────────────────────────────────────────────┘
```

ローカルに残すもの:

- 最新 50 から 200 件程度の会話キャッシュ
- 現在進行中の task state
- UI / session に必要な短期 state
- 外部 DB 同期用 outbox
- 最後に同期した cursor
- GC の cursor
- summary や重要メモリの小さいキャッシュ

外部 DB に逃がすもの:

- 全会話履歴
- 全 tool call log
- 実行イベント
- 長期メモリ
- 監査ログ
- 検索対象の本文
- Agent 横断で集計・検索したいデータ

大きな artifact / 添付 / 生成ファイルは、DB に直接入れず R2 に置き、外部 DB には R2 key と metadata だけを持たせる。

## いつ逃すか

原則として、容量が危なくなってから逃がすのではなく、書き込み時点で外部 DB に保存する。

```txt
User / tool event
  |
  v
Agent receives event
  |
  v
Write to external DB via Hyperdrive
  |
  +-- success -----------------------------+
  |                                        |
  v                                        v
Store small recent cache locally       Mark as synced
  |                                        |
  v                                        v
Run small local GC if needed           Continue turn

  +-- failure -----------------------------+
                                           |
                                           v
                                      Store outbox locally
                                           |
                                           v
                                      Retry later
```

この設計では、外部 DB が source of truth になる。Agent SQLite / D1 は最新表示や復旧のための短期コピーであり、全履歴を保持しない。

例外的に、外部 DB 書き込みに失敗した場合だけ outbox に最小 payload を保存する。ただし outbox が膨らみ続けるとローカル容量を圧迫するため、一定量を超えたら新規の巨大書き込みを止める、あるいはユーザーに一時的な失敗として返す。

## 読み込み方針

各 Agent が過去の会話や log を確認したい場合は、Hyperdrive 経由で外部 DB を読みに行く。

ただし毎回 raw log を全検索すると重いので、読み込みは 3 層に分ける。

```txt
┌────────────────────────────────────────────┐
│ Read path                                  │
└────────────────────────────────────────────┘

1. Local SQLite recent cache
   - 最新会話
   - current state
   - 毎 turn 使う

2. External DB summaries / memories
   - 長期メモリ
   - 会話要約
   - topic summary
   - 必要頻度は高いが raw より小さい

3. External DB raw history / logs
   - 全会話
   - tool log
   - audit
   - 検索、再現、調査時に読む
```

典型的な Agent turn:

```txt
User input
  |
  v
Load recent messages from local SQLite
  |
  v
Load relevant memory / summaries from external DB
  |
  v
Search raw history only if needed
  |
  v
Build prompt context
  |
  v
Run LLM / tools
  |
  v
Persist new data to external DB
  |
  v
Refresh local recent cache
```

## 逃した後にどう clear するか

ローカル DB の clear は、一括削除ではなく小さい GC を継続的に走らせる。

削除してよい条件:

- 外部 DB に保存済みである。
- `remote_synced = 1` が付いている。
- `remote_synced_at` から grace period が経過している。
- 最新 N 件の保持対象ではない。
- 実行中 task や復旧 checkpoint ではない。

削除してはいけないもの:

- 未同期 outbox
- 実行中 task state
- lock / lease
- migration cursor
- GC cursor
- client にまだ同期すべき current state
- 復旧に必要な checkpoint

状態遷移:

```txt
┌───────────────┐
│ local_pending │
└───────┬───────┘
        │ external DB write success
        v
┌───────────────┐
│ remote_synced │
└───────┬───────┘
        │ grace period passed
        v
┌───────────────┐
│ gc_eligible   │
└───────┬───────┘
        │ small batch delete
        v
┌───────────────┐
│ local_deleted │
└───────────────┘

external DB write failure
        |
        v
┌───────────────┐
│ outbox_retry  │
└───────────────┘
```

GC の発火条件は複数持つ。

```txt
Run GC when:

- local row count > threshold
- approx local bytes > threshold
- oldest cache row is older than TTL
- successful write count since last GC > threshold
- Agent starts / wakes
- scheduled maintenance runs
```

削除は 1 回あたり 500 から 1000 件程度の小さいバッチにする。巨大 DELETE を 1 回で実行しない。

```sql
SELECT id
FROM recent_messages
WHERE remote_synced = 1
  AND remote_synced_at < ?
  AND expires_at < ?
  AND id NOT IN (
    SELECT id
    FROM recent_messages
    ORDER BY created_at DESC
    LIMIT 100
  )
LIMIT 500;
```

取得した ID を対象に削除する。

```sql
DELETE FROM recent_messages
WHERE id IN (...);
```

## ローカルテーブルに必要な列

ローカルにキャッシュするテーブルには、同期状態と削除判断に必要な列を持たせる。

```sql
CREATE TABLE recent_messages (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  remote_id TEXT,
  remote_synced INTEGER NOT NULL DEFAULT 0,
  remote_synced_at INTEGER
);
```

outbox:

```sql
CREATE TABLE outbox (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER,
  next_attempt_at INTEGER
);
```

ローカル容量の概算:

```sql
CREATE TABLE local_storage_stats (
  table_name TEXT PRIMARY KEY,
  approx_bytes INTEGER NOT NULL,
  row_count INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

正確な DB サイズが取れない場合でも、`content.length` や JSON payload の byte length を概算で足して GC 判断に使う。

## 外部 DB の基本スキーマ

外部 DB では全テーブルに `agent_id` を持たせる。Agent インスタンスごとにローカル SQLite は分かれるが、外部 DB では `agent_id` によって履歴を分離する。

```sql
CREATE TABLE agent_messages (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_messages_agent_created
ON agent_messages (agent_id, created_at DESC);
```

```sql
CREATE TABLE agent_tool_logs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  input JSONB,
  output JSONB,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_tool_logs_agent_created
ON agent_tool_logs (agent_id, created_at DESC);
```

```sql
CREATE TABLE agent_memories (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  memory_key TEXT NOT NULL,
  summary TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_memories_agent_importance
ON agent_memories (agent_id, importance DESC, updated_at DESC);
```

## 既存データの移行

すでに Agent SQLite / D1 に履歴がある場合は、移行用の cursor を使って段階的に外部 DB へ逃がす。

```txt
┌──────────────────────┐
│ Existing local data   │
└──────────┬───────────┘
           │ read batch by cursor
           v
┌──────────────────────┐
│ Insert into external  │
│ DB via Hyperdrive     │
└──────────┬───────────┘
           │ success
           v
┌──────────────────────┐
│ Mark remote_synced    │
└──────────┬───────────┘
           │ grace period
           v
┌──────────────────────┐
│ Local GC              │
└──────────────────────┘
```

移行時も一括で全部消さない。Agent ごと、テーブルごと、cursor ごとに小さい単位で進める。

Agent の自動列挙が難しい場合に備えて、Agent 作成時に外部 DB か registry に `agent_id` を登録する。

```sql
CREATE TABLE agent_registry (
  agent_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  migration_status TEXT NOT NULL DEFAULT 'not_started'
);
```

## 運用上の注意

外部 DB が source of truth になるため、Hyperdrive 先 DB の設計がボトルネックになる。

注意点:

- `agent_id` を含む index を必ず作る。
- raw log と summary / memory を分ける。
- 大きい blob は R2 に逃がす。
- outbox が肥大化したら backpressure をかける。
- 外部 DB 障害時にローカル DB が無制限に膨らまないようにする。
- GC は request path で少しずつ、または scheduled workflow で進める。
- Agent SQLite / D1 を source of truth に戻さない。

## 未決定の論点

今後議論が必要な点:

- 外部 DB は PostgreSQL と MySQL のどちらにするか。
- Hyperdrive 先 DB のリージョンをどこに置くか。
- ローカル recent cache の保持件数を何件にするか。
- grace period を何分または何時間にするか。
- outbox の最大容量をいくつにするか。
- 外部 DB 障害時にリクエストを失敗させるか、劣化モードで受けるか。
- raw conversation をどの粒度で summary 化するか。
- Agent 横断検索を SQL で行うか、Vectorize / pgvector を使うか。
- D1 を完全に外すか、registry / lightweight projection として残すか。
- GC を Agent 内で行うか、別 workflow / scheduled job に分けるか。

## 現時点の結論

各 Agent の SQLite や D1 の容量制限を実質的に突破するには、ローカル DB を拡張しようとするのではなく、巨大化するデータを最初から Hyperdrive 経由の外部 DB に保存する。

Agent SQLite / D1 は短期キャッシュと同期制御だけを担う。過去の会話や log が必要になったときは、各 Agent が Hyperdrive 経由で外部 DB を参照する。逃した後の clear は、`remote_synced` を確認した行だけを、TTL、最新 N 件保持、grace period、小バッチ GC の組み合わせで削除する。

