import {
  Think,
  type MessageConcurrency,
  type Session,
  type ToolCallContext,
  type ToolCallDecision,
  type TurnContext
} from "@cloudflare/think";
import { callable } from "agents";
import { Output, tool, type LanguageModel, type ToolSet } from "ai";
import { z } from "zod";
import type {
  DeskMode,
  DraftTone,
  SupportDeskState,
  TicketPriorityFilter,
  TicketStatus,
  TicketStatusFilter
} from "@/shared/contracts";
import { getSupportDeskModel } from "@/server/ai/model";
import {
  normalizeAnalyticsInput,
  runDynamicWorkerTicketAnalytics as runDynamicWorkerTicketAnalyticsInSandbox
} from "@/server/analytics/dynamicWorkerTicketAnalytics";
import type { Env } from "@/server/env";
import { getCurrentWeather } from "@/server/integrations/openMeteo/client";
import { isSqliteContention } from "@/server/utils/errors";
import { nowIso } from "@/server/utils/time";
import { structuredTenantReportSchema } from "@/server/contexts/supportDesk/ai/schemas";
import {
  replyDraftUserPrompt,
  supportDeskSystemPrompt
} from "@/server/contexts/supportDesk/ai/prompts";
import { readonlyToolNames, isMutatingTool } from "@/server/contexts/supportDesk/ai/toolPolicy";
import { createSupportDeskTools } from "@/server/contexts/supportDesk/ai/tools";
import {
  createSupportDeskStore,
  type SqlQuery
} from "@/server/contexts/supportDesk/infrastructure/sqliteSupportDeskStore";
import { createSupportDeskApplication } from "@/server/contexts/supportDesk/application/supportDeskApplication";
import { createSemanticSearchService } from "@/server/contexts/supportDesk/application/semanticSearchService";
import { createSqliteSearchProjectionStore } from "@/server/contexts/supportDesk/infrastructure/sqliteSearchProjectionStore";
import { createVectorizeTicketSearchIndex } from "@/server/contexts/supportDesk/infrastructure/vectorizeTicketSearchIndex";
import { createWorkersAiEmbeddingProvider } from "@/server/contexts/supportDesk/infrastructure/workersAiEmbeddingProvider";
import { ReplyDraftAgent } from "@/server/agents/replyDraftAgent";

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

  private getSqlQuery(): SqlQuery {
    return <T = Record<string, unknown>>(
      strings: TemplateStringsArray,
      ...values: any[]
    ) => this.sql<T>(strings, ...values);
  }

  private getApplication() {
    return createSupportDeskApplication(
      createSupportDeskStore(this.getSqlQuery(), this.name)
    );
  }

  private getSemanticSearchService() {
    return createSemanticSearchService({
      workspaceId: this.name,
      ticketRepository: this.getApplication(),
      projectionStore: createSqliteSearchProjectionStore(this.getSqlQuery()),
      embeddingProvider: createWorkersAiEmbeddingProvider(this.env),
      searchIndex: createVectorizeTicketSearchIndex(this.env)
    });
  }

  async onStart() {
    const supportDesk = this.getApplication();
    supportDesk.initSchema();

    if (supportDesk.getTicketCount() === 0) {
      await this.seedDemoData({ reset: false });
    } else {
      this.refreshMetrics();
    }

    try {
      await this.scheduleEvery(120, "refreshMetricsFromSchedule", {
        reason: "keep-client-metrics-fresh"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Skipped metric refresh schedule registration in local dev: ${message}`);
    }
  }

  getModel(): LanguageModel {
    return getSupportDeskModel(this.env);
  }

  getSystemPrompt(): string {
    return supportDeskSystemPrompt();
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

  getTools(): ToolSet {
    return createSupportDeskTools(this.env, {
      listTickets: (status, priority, limit) => this.listTickets(status, priority, limit),
      getTicket: (ticketId) => this.getTicket(ticketId),
      searchTickets: (query, limit) => this.searchTickets(query, limit),
      getWeather: (input) => this.getWeather(input),
      runDynamicWorkerTicketAnalytics: (input) =>
        this.runDynamicWorkerTicketAnalytics(input),
      draftReplyWithSubAgent: (ticketId, tone) =>
        this.draftReplyWithSubAgent(ticketId, tone),
      addInternalNote: (ticketId, body, createdBy) =>
        this.addInternalNote(ticketId, body, createdBy),
      changeTicketStatus: (ticketId, status, reason) =>
        this.changeTicketStatus(ticketId, status, reason),
      seedDemoData: () => this.seedDemoData({ reset: true }),
      semanticSearchTickets: (input) => this.semanticSearchTickets(input),
      reindexSearch: (input) => this.reindexSearch(input)
    });
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
        activeTools: readonlyToolNames
      };
    }

    return {
      system: `${ctx.system}\n\n${extra}`
    };
  }

  beforeToolCall(ctx: ToolCallContext): ToolCallDecision | void {
    if (this.state.mode === "readonly" && isMutatingTool(ctx.toolName)) {
      return {
        action: "block",
        reason: "readonly modeのため、変更系ツールは実行できません。"
      };
    }
  }

  afterToolCall(ctx: any) {
    console.log("tool call finished", {
      toolName: ctx.toolName,
      success: ctx.success,
      durationMs: ctx.durationMs
    });
  }

  onChatError(error: unknown) {
    console.error("SupportDeskAgent chat error", error);
    const message = error instanceof Error ? error.message : String(error);
    this.setState({ ...this.state, lastError: message, lastActivityAt: nowIso() });
    return new Error("SupportDeskPilotの処理中にエラーが起きました。ログを確認してください。");
  }

  initSchema() {
    this.getApplication().initSchema();
  }

  @callable()
  async seedDemoData(options?: { reset?: boolean }) {
    const result = this.getApplication().seedDemoData(options);
    this.refreshMetrics();
    return result;
  }

  refreshMetricsFromSchedule() {
    this.refreshMetrics();
  }

  refreshMetrics() {
    const metrics = this.getApplication().getMetricCounts();

    try {
      this.setState({
        ...this.state,
        workspaceId: this.name,
        seeded: true,
        openTicketCount: metrics.openTicketCount,
        urgentTicketCount: metrics.urgentTicketCount,
        lastActivityAt: nowIso(),
        lastError: null
      });
    } catch (error) {
      if (isSqliteContention(error)) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Skipped metric state refresh because local SQLite storage is busy: ${message}`);
        return;
      }

      throw error;
    }
  }

  @callable()
  setMode(mode: DeskMode) {
    this.setState({ ...this.state, mode, lastActivityAt: nowIso() });
    return this.state;
  }

  @callable()
  getTenantOverview() {
    return this.getApplication().getTenantOverview(this.state);
  }

  @callable()
  listTickets(
    status: TicketStatusFilter = "open",
    priority: TicketPriorityFilter = "all",
    limit = 10
  ) {
    return this.getApplication().listTickets(status, priority, limit);
  }

  @callable()
  getTicket(ticketId: string) {
    return this.getApplication().getTicket(ticketId);
  }

  @callable()
  searchTickets(query: string, limit = 10) {
    return this.getApplication().searchTickets(query, limit);
  }

  async getWeather(input: {
    city: string;
    countryCode?: string;
    timezone?: string;
  }) {
    return getCurrentWeather(input);
  }

  @callable()
  async runDynamicWorkerTicketAnalytics(input?: {
    status?: TicketStatusFilter;
    priority?: TicketPriorityFilter;
    limit?: number;
  }) {
    const normalized = normalizeAnalyticsInput(input);
    const tickets = this.listTickets(
      normalized.status,
      normalized.priority,
      normalized.limit
    );

    return runDynamicWorkerTicketAnalyticsInSandbox({
      env: this.env,
      tickets
    });
  }

  @callable()
  async semanticSearchTickets(input: {
    query: string;
    status?: TicketStatusFilter;
    priority?: TicketPriorityFilter;
    limit?: number;
  }) {
    return this.getSemanticSearchService().searchSimilarTickets(input);
  }

  @callable()
  async reindexSearch(input?: {
    status?: TicketStatusFilter;
    priority?: TicketPriorityFilter;
    limit?: number;
  }) {
    return this.getSemanticSearchService().reindexTickets(input);
  }

  @callable()
  async addInternalNote(ticketId: string, body: string, createdBy = "human") {
    const result = this.getApplication().addInternalNote(ticketId, body, createdBy);
    if (result.ok) this.refreshMetrics();
    return result;
  }

  @callable()
  async changeTicketStatus(ticketId: string, status: TicketStatus, reason: string) {
    const result = this.getApplication().changeTicketStatus(ticketId, status, reason);
    if (result.ok) this.refreshMetrics();
    return result;
  }

  @callable()
  async draftReplyWithSubAgent(
    ticketId: string,
    tone: DraftTone = "friendly"
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
      replyDraftUserPrompt({ tone, ticketJson: ticketResult }),
      {
        onEvent: (event: string) => {
          chunks.push(event);
        },
        onDone: () => console.log("ReplyDraftAgent completed", ticketId),
        onError: (error: unknown) => console.error("ReplyDraftAgent failed", error)
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
              const result = this.getApplication().saveDraft(
                ticketId,
                subject,
                body,
                savedTone
              );

              capturedDraft = {
                subject,
                body,
                tone: savedTone,
                savedDraftId: result.draftId
              };

              this.refreshMetrics();
              return result;
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
