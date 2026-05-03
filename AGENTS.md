# AGENTS.md

## このアプリの目的

このアプリは、Cloudflare Agents SDK をキャッチアップするための実験用アプリです。

題材としてサポートデスク向け AI Agent を扱い、問い合わせチケットを Durable Object SQLite に保存し、Agent が検索、要約、優先度付け、返信案作成、内部メモ追加、ステータス変更を行えるようにしています。

変更系操作は human-in-the-loop の承認 UI を通して実行し、Cloudflare Agents の state、tool、approval、sub-agent、Durable Object、Workers AI、外部 capability の扱いを確認します。

## アーキテクチャ思想

詳細な方針は `docs/cloudflare-agents-architecture.md` を参照してください。

このリポジトリでは、Agent を業務ロジックそのものではなく、AI に業務機能や外部能力をどう見せるかを決める actor として扱います。

まず決めるべきものは Agent や Tool の数ではなく、業務境界です。新しい機能を追加するときは、既存の bounded context に属するのか、新しい context として分けるのか、業務非依存の capability に切り出すのかを先に判断します。

業務判断は context に置き、外部 API や Cloudflare binding の具体操作は capability または infrastructure に閉じ込めます。Agent は prompt、state、tool 公開、approval policy、orchestration を担当し、できるだけ薄く保ちます。

依存方向は上位から下位へ流します。

```txt
agents
  -> contexts
  -> capabilities
  -> workflows / projections / platform
```

避けること:

- `contexts` や `capabilities` から `agents` に依存する
- Agent に raw SQL や外部 API の `fetch()` を直接置く
- Tool 定義に業務判断の本体を埋め込む
- `domain` から `infrastructure` に依存する
- 重い処理や長い処理を Agent の 1 turn に閉じ込める

配置の基本:

- `agents/*`: Cloudflare Agents SDK の actor、state、prompt、tool、approval policy
- `agents/*/tools/*`: AI に公開する tool interface
- `contexts/*`: 業務 bounded context、domain、application use case、ports、infrastructure
- `capabilities/*`: 天気、Slack、Email など、業務非依存の外部能力 adapter
- `workflows/*`: Queue、Cron、retry など、1 turn に閉じない処理
- `projections/*`: 横断集計や読み取り最適化 read model
- `platform/*`: Env 型、binding 型、logger、error、time helper などの共通基盤
- `shared/*`: client / server 間で共有する serializable contract

新機能追加時は、次の順で考えます。

1. context boundary を決める
2. use case を context の application に置く
3. domain rule を domain に置く
4. 外部能力は capability に隔離する
5. AI に使わせる必要があるものだけ Agent tool として公開する
6. 長い処理は workflow に逃がす
7. 横断参照が必要なら projection を作る

最重要ルール:

まず context boundary を決める。次に use case を application に置く。外部能力は capability に隔離する。AI への公開方法は Agent tool に置く。Agent 分割は状態、権限、承認、Tool 集合が独立してから行う。
