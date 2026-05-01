import { Think, type Session, type MessageConcurrency, type TurnContext, type ToolCallContext, type ToolCallDecision } from "@cloudflare/think";
import { callable, routeAgentRequest } from "agents";
import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { createCodeTool } from "@cloudflare/codemode/ai";
import { Output, tool, type LanguageModel, type ToolSet } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";

type Env = {
  AI: Ai;
  LOADER: any;
  SupportDeskAgent: DurableObjectNamespace<SupportDeskAgent>;
};

export type TicketStatus = "open" | "pending" | "resolved";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type DeskMode = "normal" | "readonly";

export type SupportDeskState = {
  workspaceId: string;
  mode: DeskMode;
  seeded: boolean;
  openTicketCount: number;
  urgentTicketCount: number;
  lastActivityAt: string | null;
  lastError: string | null;
};

export type TenantOverview = {
  tenantId: string;
  durableObjectClass: "SupportDeskAgent";
  storageBackend: "sqlite";
  mode: DeskMode;
  seeded: boolean;
  counts: {
    tickets: number;
    notes: number;
    drafts: number;
    auditLog: number;
    openOrPending: number;
    urgent: number;
  };
  byStatus: Record<TicketStatus, number>;
  byPriority: Record<TicketPriority, number>;
  byCategory: Record<string, number>;
  latestTickets: Array<{
    id: string;
    subject: string;
    status: TicketStatus;
    priority: TicketPriority;
    updatedAt: string;
  }>;
  latestAuditLog: Array<{
    action: string;
    targetId: string;
    createdAt: string;
  }>;
};

type TicketRow = {
  id: string;
  customer_name: string;
  customer_email: string;
  subject: string;
  body: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  tags_json: string;
  created_at: string;
  updated_at: string;
};

type NoteRow = {
  id: string;
  ticket_id: string;
  body: string;
  created_by: string;
  created_at: string;
};

type DraftRow = {
  id: string;
  ticket_id: string;
  subject: string;
  body: string;
  tone: string;
  created_at: string;
};

type AuditLogRow = {
  action: string;
  target_id: string;
  created_at: string;
};

type TicketView = {
  id: string;
  customerName: string;
  customerEmail: string;
  subject: string;
  body: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

type CountRow<T extends string = string> = {
  name: T;
  count: number;
};

const nowIso = () => new Date().toISOString();

const structuredTenantReportSchema = z.object({
  tenantId: z.string(),
  generatedAt: z.string(),
  summary: z.string(),
  metrics: z.object({
    totalTickets: z.number(),
    openOrPendingTickets: z.number(),
    urgentTickets: z.number(),
    notes: z.number(),
    drafts: z.number(),
    auditLogEntries: z.number()
  }),
  statusBreakdown: z.object({
    open: z.number(),
    pending: z.number(),
    resolved: z.number()
  }),
  priorityBreakdown: z.object({
    low: z.number(),
    medium: z.number(),
    high: z.number(),
    urgent: z.number()
  }),
  categoryBreakdown: z.record(z.string(), z.number()),
  topRisks: z.array(
    z.object({
      ticketId: z.string(),
      reason: z.string(),
      severity: z.enum(["low", "medium", "high", "urgent"])
    })
  ),
  nextActions: z.array(
    z.object({
      label: z.string(),
      ticketId: z.string().nullable(),
      priority: z.enum(["low", "medium", "high", "urgent"])
    })
  ),
  confidence: z.enum(["low", "medium", "high"])
});

function toTicketView(row: TicketRow): TicketView {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    subject: row.subject,
    body: row.body,
    status: row.status,
    priority: row.priority,
    category: row.category,
    tags: JSON.parse(row.tags_json) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

const demoTickets = [
  {
    id: "T-1001",
    customerName: "田中 美咲",
    customerEmail: "misaki@example.test",
    subject: "請求書の宛名を会社名に変更したい",
    body:
      "今月分の請求書の宛名が個人名になっています。経理提出のため、株式会社サンプル 田中美咲 宛に変更できますか？",
    status: "open" as TicketStatus,
    priority: "medium" as TicketPriority,
    category: "billing",
    tags: ["invoice", "account"]
  },
  {
    id: "T-1002",
    customerName: "佐藤 翔太",
    customerEmail: "shota@example.test",
    subject: "ログイン後に白い画面になる",
    body:
      "昨日からログイン後にダッシュボードが白い画面のまま表示されません。Chrome最新版、Macです。業務で使っているので早めに確認したいです。",
    status: "open" as TicketStatus,
    priority: "urgent" as TicketPriority,
    category: "bug",
    tags: ["login", "frontend", "urgent"]
  },
  {
    id: "T-1003",
    customerName: "山本 玲奈",
    customerEmail: "reina@example.test",
    subject: "CSVエクスポートの列順を固定したい",
    body:
      "毎週レポートをCSVで出していますが、列順が変わることがあります。列順を固定する設定はありますか？",
    status: "pending" as TicketStatus,
    priority: "low" as TicketPriority,
    category: "feature_request",
    tags: ["csv", "reporting"]
  },
  {
    id: "T-1004",
    customerName: "鈴木 健",
    customerEmail: "ken@example.test",
    subject: "API rate limitの上限について",
    body:
      "現在のプランでAPI rate limitはいくつですか？夜間バッチで429が出ることがあります。上限緩和の方法も知りたいです。",
    status: "open" as TicketStatus,
    priority: "high" as TicketPriority,
    category: "technical_question",
    tags: ["api", "rate-limit"]
  },
  {
    id: "T-1005",
    customerName: "伊藤 葵",
    customerEmail: "aoi@example.test",
    subject: "退会ではなく一時停止できますか？",
    body:
      "来月から2か月だけ利用しない予定です。アカウントを削除せず、一時停止や休止のような扱いは可能でしょうか？",
    status: "open" as TicketStatus,
    priority: "medium" as TicketPriority,
    category: "account",
    tags: ["plan", "retention"]
  }
];

export class SupportDeskAgent extends Think<Env, SupportDeskState> {
  initialState: SupportDeskState = {
    workspaceId: "unknown",
    mode: "normal",
    seeded: false,
    openTicketCount: 0,
    urgentTicketCount: 0,
    lastActivityAt: null,
    lastError: null
  };

  override maxSteps = 8;
  override sendReasoning = false;
  override messageConcurrency: MessageConcurrency = "queue";
  override chatRecovery = true;

  async onStart() {
    this.initSchema();

    if (this.state.workspaceId === "unknown") {
      this.setState({ ...this.state, workspaceId: this.name });
    }

    const [{ count }] = this.sql<{ count: number }>`SELECT COUNT(*) AS count FROM tickets`;
    if (count === 0) {
      await this.seedDemoData({ reset: false });
    } else {
      this.refreshMetrics();
    }

    await this.scheduleEvery(120, "refreshMetricsFromSchedule", {
      reason: "keep-client-metrics-fresh"
    });
  }

  getModel(): LanguageModel {
    return createWorkersAI({ binding: this.env.AI })("@cf/moonshotai/kimi-k2.6");
  }

  getSystemPrompt(): string {
    return `
あなたはSupportDeskPilotです。SaaSの問い合わせ対応チームを支援するAIエージェントです。

目的:
- ローカルDBに保存されたチケットを検索・要約する
- 優先度、カテゴリ、次アクションを提案する
- 返信案作成はReplyDraftAgent sub-agentに委譲できる
- 複数チケットの集計・条件分岐・ループ処理にはcodemodeを使える
- codemodeは読み取り専用Toolだけを束ねた安全なコード実行入口として扱う
- Dynamic Worker analyticsは、チケット配列を分離サンドボックスへ渡して集計する
- 内部メモ追加やステータス変更は、ユーザー承認後だけ実行する

出力ルール:
- 日本語で回答する
- チケットIDを必ず明示する
- 根拠と推測を分ける
- 顧客向け返信案は丁寧で短めにする
- mode=readonly の場合は変更系操作をしない
`.trim();
  }

  configureSession(session: Session) {
    return session
      .withContext("soul", {
        provider: {
          get: async () => this.getSystemPrompt()
        }
      })
      .withContext("memory", {
        description:
          "サポートチームの運用方針、頻出問い合わせ、顧客対応の好み、過去の判断。",
        maxTokens: 2000
      })
      .withCachedPrompt();
  }

  getReadOnlyTicketTools(): ToolSet {
    return {
      listTickets: tool({
        description:
          "List support tickets from local SQLite. Use this before summarizing the inbox.",
        inputSchema: z.object({
          status: z.enum(["open", "pending", "resolved", "all"]).default("open"),
          priority: z.enum(["low", "medium", "high", "urgent", "all"]).default("all"),
          limit: z.number().int().min(1).max(20).default(10)
        }),
        execute: async ({ status, priority, limit }) => {
          return this.listTickets(status, priority, limit);
        }
      }),

      getTicket: tool({
        description: "Get one ticket with notes and drafts.",
        inputSchema: z.object({
          ticketId: z.string().describe("Ticket ID such as T-1002")
        }),
        execute: async ({ ticketId }) => {
          return this.getTicket(ticketId);
        }
      }),

      searchTickets: tool({
        description:
          "Search support tickets by keyword across subject, body, category, and tags.",
        inputSchema: z.object({
          query: z.string().min(1),
          limit: z.number().int().min(1).max(20).default(10)
        }),
        execute: async ({ query, limit }) => {
          return this.searchTickets(query, limit);
        }
      })
    };
  }

  createCodemodeTool(readOnlyTools: ToolSet) {
    const executor = new DynamicWorkerExecutor({
      loader: this.env.LOADER,
      timeout: 15_000,
      globalOutbound: null
    });

    return createCodeTool({
      tools: readOnlyTools,
      executor,
      description: `
Run JavaScript code in an isolated Dynamic Worker sandbox to orchestrate read-only support desk tools.

Use this when you need loops, branching, sorting, grouping, joining, or multi-step analysis across many tickets.
The sandbox has no outbound network access. It can only call the read-only codemode.* API below.
Do not use this for mutations such as adding notes, changing ticket status, sending messages, or seeding data.

{{types}}
`.trim()
    });
  }

  getTools(): ToolSet {
    const readOnlyTools = this.getReadOnlyTicketTools();

    return {
      ...readOnlyTools,

      codemode: this.createCodemodeTool(readOnlyTools),

      runDynamicWorkerTicketAnalytics: tool({
        description:
          "Run a reusable Dynamic Worker sandbox to compute ticket analytics from local tickets. Read-only.",
        inputSchema: z.object({
          status: z.enum(["open", "pending", "resolved", "all"]).default("all"),
          priority: z.enum(["low", "medium", "high", "urgent", "all"]).default("all"),
          limit: z.number().int().min(1).max(50).default(30)
        }),
        execute: async ({ status, priority, limit }) => {
          return this.runDynamicWorkerTicketAnalytics({ status, priority, limit });
        }
      }),

      draftReplyWithSubAgent: tool({
        description:
          "Ask ReplyDraftAgent sub-agent to create a customer-facing reply draft for one ticket. This saves a local draft.",
        inputSchema: z.object({
          ticketId: z.string(),
          tone: z.enum(["friendly", "formal", "apologetic", "concise"]).default("friendly")
        }),
        needsApproval: async () => true,
        execute: async ({ ticketId, tone }) => {
          return this.draftReplyWithSubAgent(ticketId, tone);
        }
      }),

      addInternalNote: tool({
        description:
          "Add an internal note to a ticket. This changes local state and requires human approval.",
        inputSchema: z.object({
          ticketId: z.string(),
          body: z.string().min(1),
          createdBy: z.string().default("agent")
        }),
        needsApproval: async () => true,
        execute: async ({ ticketId, body, createdBy }) => {
          return this.addInternalNote(ticketId, body, createdBy);
        }
      }),

      changeTicketStatus: tool({
        description:
          "Change ticket status in local SQLite. This requires human approval.",
        inputSchema: z.object({
          ticketId: z.string(),
          status: z.enum(["open", "pending", "resolved"]),
          reason: z.string().min(1)
        }),
        needsApproval: async () => true,
        execute: async ({ ticketId, status, reason }) => {
          return this.changeTicketStatus(ticketId, status, reason);
        }
      }),

      seedDemoData: tool({
        description:
          "Reset and seed demo support tickets. Requires approval because it overwrites demo data.",
        inputSchema: z.object({}),
        needsApproval: async () => true,
        execute: async () => {
          return this.seedDemoData({ reset: true });
        }
      })
    };
  }

  beforeTurn(ctx: TurnContext) {
    const mode = ctx.body?.mode === "readonly" ? "readonly" : this.state.mode;
    const responseMode =
      ctx.body?.responseMode === "structured" ? "structured" : "text";

    const extra = [
      `Workspace ID: ${this.state.workspaceId}`,
      `Current mode: ${mode}`,
      `Open tickets: ${this.state.openTicketCount}`,
      `Urgent tickets: ${this.state.urgentTicketCount}`
    ].join("\n");

    if (responseMode === "structured") {
      const overview = this.getTenantOverview();
      const structuredContext = [
        extra,
        "",
        "Structured response mode is enabled.",
        "Return only a JSON object that matches the provided schema.",
        "Use the following tenant snapshot as the source of truth.",
        JSON.stringify(overview, null, 2)
      ].join("\n");

      return {
        system: `${ctx.system}\n\n${structuredContext}`,
        activeTools: [],
        output: Output.object({
          schema: structuredTenantReportSchema,
          name: "tenant_support_report",
          description:
            "A structured JSON support desk report for the current tenant."
        })
      };
    }

    if (mode === "readonly") {
      return {
        system: `${ctx.system}\n\n${extra}`,
        activeTools: [
          "listTickets",
          "getTicket",
          "searchTickets",
          "codemode",
          "runDynamicWorkerTicketAnalytics",
          "read",
          "list",
          "find",
          "grep"
        ]
      };
    }

    return {
      system: `${ctx.system}\n\n${extra}`
    };
  }

  beforeToolCall(ctx: ToolCallContext): ToolCallDecision | void {
    const mutatingTools = new Set([
      "draftReplyWithSubAgent",
      "addInternalNote",
      "changeTicketStatus",
      "seedDemoData",
      "write",
      "edit",
      "delete"
    ]);

    if (this.state.mode === "readonly" && mutatingTools.has(ctx.toolName)) {
      return {
        action: "block",
        reason: "readonly modeのため、変更系ツールは実行できません。"
      };
    }
  }

  afterToolCall(ctx: any) {
    console.log("tool call finished", ctx);
  }

  onChatError(error: unknown) {
    console.error("SupportDeskAgent chat error", error);
    const message = error instanceof Error ? error.message : String(error);
    this.setState({ ...this.state, lastError: message, lastActivityAt: nowIso() });
    return new Error("SupportDeskPilotの処理中にエラーが起きました。ログを確認してください。" );
  }

  initSchema() {
    this.sql`
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        category TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;

    this.sql`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        body TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `;

    this.sql`
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        tone TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `;

    this.sql`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        target_id TEXT NOT NULL,
        detail_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `;
  }

  @callable()
  async seedDemoData(options?: { reset?: boolean }) {
    this.initSchema();

    if (options?.reset) {
      this.sql`DELETE FROM notes`;
      this.sql`DELETE FROM drafts`;
      this.sql`DELETE FROM audit_log`;
      this.sql`DELETE FROM tickets`;
    }

    const createdAt = nowIso();

    for (const ticket of demoTickets) {
      this.sql`
        INSERT INTO tickets (
          id,
          customer_name,
          customer_email,
          subject,
          body,
          status,
          priority,
          category,
          tags_json,
          created_at,
          updated_at
        ) VALUES (
          ${ticket.id},
          ${ticket.customerName},
          ${ticket.customerEmail},
          ${ticket.subject},
          ${ticket.body},
          ${ticket.status},
          ${ticket.priority},
          ${ticket.category},
          ${JSON.stringify(ticket.tags)},
          ${createdAt},
          ${createdAt}
        )
        ON CONFLICT(id) DO UPDATE SET
          customer_name = excluded.customer_name,
          customer_email = excluded.customer_email,
          subject = excluded.subject,
          body = excluded.body,
          status = excluded.status,
          priority = excluded.priority,
          category = excluded.category,
          tags_json = excluded.tags_json,
          updated_at = excluded.updated_at
      `;
    }

    this.sql`
      INSERT INTO audit_log (id, action, target_id, detail_json, created_at)
      VALUES (${crypto.randomUUID()}, ${"seedDemoData"}, ${"workspace"}, ${JSON.stringify({ reset: Boolean(options?.reset) })}, ${createdAt})
    `;

    this.refreshMetrics();

    return {
      ok: true,
      seeded: demoTickets.length,
      reset: Boolean(options?.reset)
    };
  }

  refreshMetricsFromSchedule() {
    this.refreshMetrics();
  }

  refreshMetrics() {
    const [open] = this.sql<{ count: number }>`
      SELECT COUNT(*) AS count
      FROM tickets
      WHERE status IN ('open', 'pending')
    `;

    const [urgent] = this.sql<{ count: number }>`
      SELECT COUNT(*) AS count
      FROM tickets
      WHERE priority = 'urgent' AND status != 'resolved'
    `;

    this.setState({
      ...this.state,
      seeded: true,
      openTicketCount: open?.count ?? 0,
      urgentTicketCount: urgent?.count ?? 0,
      lastActivityAt: nowIso(),
      lastError: null
    });
  }

  @callable()
  setMode(mode: DeskMode) {
    this.setState({ ...this.state, mode, lastActivityAt: nowIso() });
    return this.state;
  }

  @callable()
  getTenantOverview(): TenantOverview {
    this.initSchema();

    const [tickets] = this.sql<{ count: number }>`SELECT COUNT(*) AS count FROM tickets`;
    const [notes] = this.sql<{ count: number }>`SELECT COUNT(*) AS count FROM notes`;
    const [drafts] = this.sql<{ count: number }>`SELECT COUNT(*) AS count FROM drafts`;
    const [auditLog] = this.sql<{ count: number }>`SELECT COUNT(*) AS count FROM audit_log`;
    const [openOrPending] = this.sql<{ count: number }>`
      SELECT COUNT(*) AS count
      FROM tickets
      WHERE status IN ('open', 'pending')
    `;
    const [urgent] = this.sql<{ count: number }>`
      SELECT COUNT(*) AS count
      FROM tickets
      WHERE priority = 'urgent' AND status != 'resolved'
    `;

    const byStatusRows = this.sql<CountRow<TicketStatus>>`
      SELECT status AS name, COUNT(*) AS count
      FROM tickets
      GROUP BY status
    `;
    const byPriorityRows = this.sql<CountRow<TicketPriority>>`
      SELECT priority AS name, COUNT(*) AS count
      FROM tickets
      GROUP BY priority
    `;
    const byCategoryRows = this.sql<CountRow>`
      SELECT category AS name, COUNT(*) AS count
      FROM tickets
      GROUP BY category
      ORDER BY count DESC, category ASC
    `;
    const latestTickets = this.sql<TicketRow>`
      SELECT *
      FROM tickets
      ORDER BY updated_at DESC
      LIMIT 5
    `;
    const latestAuditLog = this.sql<AuditLogRow>`
      SELECT action, target_id, created_at
      FROM audit_log
      ORDER BY created_at DESC
      LIMIT 5
    `;

    return {
      tenantId: this.name,
      durableObjectClass: "SupportDeskAgent",
      storageBackend: "sqlite",
      mode: this.state.mode,
      seeded: this.state.seeded,
      counts: {
        tickets: tickets?.count ?? 0,
        notes: notes?.count ?? 0,
        drafts: drafts?.count ?? 0,
        auditLog: auditLog?.count ?? 0,
        openOrPending: openOrPending?.count ?? 0,
        urgent: urgent?.count ?? 0
      },
      byStatus: {
        open: byStatusRows.find((row) => row.name === "open")?.count ?? 0,
        pending: byStatusRows.find((row) => row.name === "pending")?.count ?? 0,
        resolved: byStatusRows.find((row) => row.name === "resolved")?.count ?? 0
      },
      byPriority: {
        low: byPriorityRows.find((row) => row.name === "low")?.count ?? 0,
        medium: byPriorityRows.find((row) => row.name === "medium")?.count ?? 0,
        high: byPriorityRows.find((row) => row.name === "high")?.count ?? 0,
        urgent: byPriorityRows.find((row) => row.name === "urgent")?.count ?? 0
      },
      byCategory: Object.fromEntries(
        byCategoryRows.map((row) => [row.name, row.count])
      ),
      latestTickets: latestTickets.map((ticket) => ({
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        updatedAt: ticket.updated_at
      })),
      latestAuditLog: latestAuditLog.map((row) => ({
        action: row.action,
        targetId: row.target_id,
        createdAt: row.created_at
      }))
    };
  }

  @callable()
  listTickets(
    status: "open" | "pending" | "resolved" | "all" = "open",
    priority: "low" | "medium" | "high" | "urgent" | "all" = "all",
    limit = 10
  ) {
    this.initSchema();

    const rows = this.sql<TicketRow>`
      SELECT *
      FROM tickets
      WHERE (${status} = 'all' OR status = ${status})
        AND (${priority} = 'all' OR priority = ${priority})
      ORDER BY
        CASE priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        updated_at DESC
      LIMIT ${limit}
    `;

    return rows.map(toTicketView);
  }

  @callable()
  getTicket(ticketId: string) {
    this.initSchema();

    const [row] = this.sql<TicketRow>`
      SELECT *
      FROM tickets
      WHERE id = ${ticketId}
      LIMIT 1
    `;

    if (!row) {
      return { ok: false, error: `Ticket ${ticketId} not found.` };
    }

    const notes = this.sql<NoteRow>`
      SELECT *
      FROM notes
      WHERE ticket_id = ${ticketId}
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const drafts = this.sql<DraftRow>`
      SELECT *
      FROM drafts
      WHERE ticket_id = ${ticketId}
      ORDER BY created_at DESC
      LIMIT 5
    `;

    return {
      ok: true,
      ticket: toTicketView(row),
      notes: notes.map((note) => ({
        id: note.id,
        ticketId: note.ticket_id,
        body: note.body,
        createdBy: note.created_by,
        createdAt: note.created_at
      })),
      drafts: drafts.map((draft) => ({
        id: draft.id,
        ticketId: draft.ticket_id,
        subject: draft.subject,
        body: draft.body,
        tone: draft.tone,
        createdAt: draft.created_at
      }))
    };
  }

  @callable()
  searchTickets(query: string, limit = 10) {
    this.initSchema();
    const like = `%${query.toLowerCase()}%`;

    const rows = this.sql<TicketRow>`
      SELECT *
      FROM tickets
      WHERE lower(subject) LIKE ${like}
         OR lower(body) LIKE ${like}
         OR lower(category) LIKE ${like}
         OR lower(tags_json) LIKE ${like}
      ORDER BY updated_at DESC
      LIMIT ${limit}
    `;

    return rows.map(toTicketView);
  }

  @callable()
  async runDynamicWorkerTicketAnalytics(input?: {
    status?: "open" | "pending" | "resolved" | "all";
    priority?: "low" | "medium" | "high" | "urgent" | "all";
    limit?: number;
  }) {
    this.initSchema();

    const status = input?.status ?? "all";
    const priority = input?.priority ?? "all";
    const limit = Math.min(Math.max(input?.limit ?? 30, 1), 50);
    const tickets = this.listTickets(status, priority, limit);

    const worker = this.env.LOADER.get("supportdesk-ticket-analytics-v1", async () => ({
      compatibilityDate: "2026-05-01",
      mainModule: "src/index.js",
      modules: {
        "src/index.js": `
          function countBy(items, key) {
            return items.reduce((acc, item) => {
              const value = item[key] || "unknown";
              acc[value] = (acc[value] || 0) + 1;
              return acc;
            }, {});
          }

          function score(ticket) {
            const priorityScore = { urgent: 100, high: 70, medium: 40, low: 10 }[ticket.priority] || 0;
            const statusScore = ticket.status === "open" ? 20 : ticket.status === "pending" ? 10 : 0;
            return priorityScore + statusScore;
          }

          export default {
            async fetch(request) {
              const { tickets } = await request.json();

              const ranked = [...tickets]
                .sort((a, b) => score(b) - score(a))
                .slice(0, 10)
                .map((ticket) => ({
                  id: ticket.id,
                  subject: ticket.subject,
                  priority: ticket.priority,
                  status: ticket.status,
                  category: ticket.category,
                  score: score(ticket),
                  tags: ticket.tags
                }));

              return Response.json({
                ok: true,
                sandbox: "dynamic-worker",
                total: tickets.length,
                byStatus: countBy(tickets, "status"),
                byPriority: countBy(tickets, "priority"),
                byCategory: countBy(tickets, "category"),
                topTickets: ranked,
                recommendation: ranked.length > 0
                  ? "Start with " + ranked[0].id + ": " + ranked[0].subject
                  : "No matching tickets"
              });
            }
          };
        `
      },
      globalOutbound: null
    }));

    const entrypoint = worker.getEntrypoint();
    const response = await entrypoint.fetch(
      new Request("https://supportdesk.local/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickets })
      })
    );

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: await response.text()
      };
    }

    return response.json();
  }

  @callable()
  async addInternalNote(ticketId: string, body: string, createdBy = "human") {
    this.initSchema();

    const ticket = this.getTicket(ticketId);
    if (!ticket.ok) return ticket;

    const id = crypto.randomUUID();
    const createdAt = nowIso();

    this.sql`
      INSERT INTO notes (id, ticket_id, body, created_by, created_at)
      VALUES (${id}, ${ticketId}, ${body}, ${createdBy}, ${createdAt})
    `;

    this.sql`
      UPDATE tickets
      SET updated_at = ${createdAt}
      WHERE id = ${ticketId}
    `;

    this.sql`
      INSERT INTO audit_log (id, action, target_id, detail_json, created_at)
      VALUES (${crypto.randomUUID()}, ${"addInternalNote"}, ${ticketId}, ${JSON.stringify({ body, createdBy })}, ${createdAt})
    `;

    this.refreshMetrics();

    return {
      ok: true,
      id,
      ticketId,
      body,
      createdBy,
      createdAt
    };
  }

  @callable()
  async changeTicketStatus(ticketId: string, status: TicketStatus, reason: string) {
    this.initSchema();

    const ticket = this.getTicket(ticketId);
    if (!ticket.ok) return ticket;

    const updatedAt = nowIso();

    this.sql`
      UPDATE tickets
      SET status = ${status}, updated_at = ${updatedAt}
      WHERE id = ${ticketId}
    `;

    this.sql`
      INSERT INTO audit_log (id, action, target_id, detail_json, created_at)
      VALUES (${crypto.randomUUID()}, ${"changeTicketStatus"}, ${ticketId}, ${JSON.stringify({ status, reason })}, ${updatedAt})
    `;

    this.refreshMetrics();

    return {
      ok: true,
      ticketId,
      status,
      reason,
      updatedAt
    };
  }

  @callable()
  async draftReplyWithSubAgent(
    ticketId: string,
    tone: "friendly" | "formal" | "apologetic" | "concise" = "friendly"
  ) {
    this.initSchema();

    const ticketResult = this.getTicket(ticketId);
    if (!ticketResult.ok) return ticketResult;

    let capturedDraft:
      | { subject: string; body: string; tone: string; savedDraftId?: string }
      | null = null;

    const child = await this.subAgent(ReplyDraftAgent, `reply-${ticketId}`);
    const chunks: string[] = [];

    await child.chat(
      `
次のサポートチケットについて、顧客向け返信案を作ってください。

条件:
- tone: ${tone}
- 日本語
- 返信本文は短く、相手の不安を減らす
- 分からないことは追加確認として聞く
- 最後に必ず saveDraft tool を1回だけ呼び、subject と body を保存する

Ticket JSON:
${JSON.stringify(ticketResult, null, 2)}
`.trim(),
      {
        onEvent: (event) => {
          chunks.push(event);
        },
        onDone: () => console.log("ReplyDraftAgent completed", ticketId),
        onError: (error) => console.error("ReplyDraftAgent failed", error)
      },
      {
        tools: {
          saveDraft: tool({
            description:
              "Save the final customer-facing reply draft. Call this once when the draft is ready.",
            inputSchema: z.object({
              subject: z.string().min(1),
              body: z.string().min(1),
              tone: z.string().default(tone)
            }),
            execute: async ({ subject, body, tone: savedTone }) => {
              const id = crypto.randomUUID();
              const createdAt = nowIso();

              this.sql`
                INSERT INTO drafts (id, ticket_id, subject, body, tone, created_at)
                VALUES (${id}, ${ticketId}, ${subject}, ${body}, ${savedTone}, ${createdAt})
              `;

              capturedDraft = {
                subject,
                body,
                tone: savedTone,
                savedDraftId: id
              };

              this.sql`
                INSERT INTO audit_log (id, action, target_id, detail_json, created_at)
                VALUES (${crypto.randomUUID()}, ${"draftReplyWithSubAgent"}, ${ticketId}, ${JSON.stringify({ draftId: id, tone: savedTone })}, ${createdAt})
              `;

              this.refreshMetrics();

              return {
                ok: true,
                draftId: id,
                ticketId,
                savedAt: createdAt
              };
            }
          })
        }
      }
    );

    return {
      ok: Boolean(capturedDraft),
      ticketId,
      draft: capturedDraft,
      streamedEventCount: chunks.length,
      fallback:
        capturedDraft === null
          ? "Sub-agent finished, but did not call saveDraft. Ask again or inspect child messages."
          : null
    };
  }
}

export class ReplyDraftAgent extends Think<Env> {
  override maxSteps = 4;
  override sendReasoning = false;
  override messageConcurrency: MessageConcurrency = "queue";

  getModel(): LanguageModel {
    return createWorkersAI({ binding: this.env.AI })("@cf/moonshotai/kimi-k2.6");
  }

  getSystemPrompt(): string {
    return `
あなたはカスタマーサポートの返信案作成専門sub-agentです。

ルール:
- 日本語で書く
- 顧客にそのまま送れる丁寧な文面にする
- 本文は長くしすぎない
- チケットにない事実を勝手に断定しない
- 必ず最後に saveDraft tool を呼んで最終案を保存する
`.trim();
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, name: "support-desk-pilot" });
    }

    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
