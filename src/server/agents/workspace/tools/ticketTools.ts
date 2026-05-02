import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { createCodeTool } from "@cloudflare/codemode/ai";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type {
  DraftTone,
  TicketPriorityFilter,
  TicketStatus,
  TicketStatusFilter
} from "@/shared/contracts";
import type { Env } from "@/server/env";
import { ticketStatusSchema } from "@/server/agents/workspace/tools/ticketSchemas";
import {
  createSemanticSearchTools,
  type SemanticSearchToolHandlers
} from "@/server/agents/workspace/tools/searchTools";

type SupportDeskToolHandlers = {
  listTickets: (
    status: TicketStatusFilter,
    priority: TicketPriorityFilter,
    limit: number
  ) => unknown;
  getTicket: (ticketId: string) => unknown;
  searchTickets: (query: string, limit: number) => unknown;
  getWeather: (input: {
    city: string;
    countryCode?: string;
    timezone?: string;
  }) => Promise<unknown>;
  runDynamicWorkerTicketAnalytics: (input: {
    status?: TicketStatusFilter;
    priority?: TicketPriorityFilter;
    limit?: number;
  }) => Promise<unknown>;
  draftReplyWithSubAgent: (ticketId: string, tone: DraftTone) => Promise<unknown>;
  addInternalNote: (
    ticketId: string,
    body: string,
    createdBy: string
  ) => Promise<unknown>;
  changeTicketStatus: (
    ticketId: string,
    status: TicketStatus,
    reason: string
  ) => Promise<unknown>;
  seedDemoData: () => Promise<unknown>;
} & SemanticSearchToolHandlers;

export function createReadOnlyTicketTools(handlers: SupportDeskToolHandlers): ToolSet {
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
        return handlers.listTickets(status, priority, limit);
      }
    }),

    getTicket: tool({
      description: "Get one ticket with notes and drafts.",
      inputSchema: z.object({
        ticketId: z.string().describe("Ticket ID such as T-1002")
      }),
      execute: async ({ ticketId }) => {
        return handlers.getTicket(ticketId);
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
        return handlers.searchTickets(query, limit);
      }
    }),

    getWeather: tool({
      description:
        "Get current weather for a city through the approved Open-Meteo API. Use this instead of writing network fetch code in codemode.",
      inputSchema: z.object({
        city: z.string().min(1).describe("City name such as Osaka, Tokyo, or 大阪"),
        countryCode: z
          .string()
          .length(2)
          .optional()
          .describe("Optional ISO 3166-1 alpha-2 country code such as JP"),
        timezone: z
          .string()
          .default("Asia/Tokyo")
          .describe("IANA timezone for returned timestamps")
      }),
      execute: async ({ city, countryCode, timezone }) => {
        return handlers.getWeather({ city, countryCode, timezone });
      }
    })
  };
}

export function createCodemodeTool(env: Env, readOnlyTools: ToolSet) {
  const executor = new DynamicWorkerExecutor({
    loader: env.LOADER,
    timeout: 15_000,
    globalOutbound: null
  });

  return createCodeTool({
    tools: readOnlyTools,
    executor,
    description: `
Run JavaScript code in an isolated Dynamic Worker sandbox to orchestrate read-only support desk tools.

Use this when you need loops, branching, sorting, grouping, joining, or multi-step analysis across many tickets.
The sandbox has no outbound network access. For weather, call codemode.getWeather instead of fetch().
It can only call the read-only codemode.* API below.
Do not use this for mutations such as adding notes, changing ticket status, sending messages, or seeding data.

{{types}}
`.trim()
  });
}

export function createSupportDeskTools(env: Env, handlers: SupportDeskToolHandlers): ToolSet {
  const readOnlyTools = createReadOnlyTicketTools(handlers);

  return {
    ...readOnlyTools,
    ...createSemanticSearchTools(handlers),

    codemode: createCodemodeTool(env, readOnlyTools),

    runDynamicWorkerTicketAnalytics: tool({
      description:
        "Run a reusable Dynamic Worker sandbox to compute ticket analytics from local tickets. Read-only.",
      inputSchema: z.object({
        status: z.enum(["open", "pending", "resolved", "all"]).default("all"),
        priority: z.enum(["low", "medium", "high", "urgent", "all"]).default("all"),
        limit: z.number().int().min(1).max(50).default(30)
      }),
      execute: async ({ status, priority, limit }) => {
        return handlers.runDynamicWorkerTicketAnalytics({ status, priority, limit });
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
        return handlers.draftReplyWithSubAgent(ticketId, tone);
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
        return handlers.addInternalNote(ticketId, body, createdBy);
      }
    }),

    changeTicketStatus: tool({
      description:
        "Change ticket status in local SQLite. This requires human approval.",
      inputSchema: z.object({
        ticketId: z.string(),
        status: ticketStatusSchema,
        reason: z.string().min(1)
      }),
      needsApproval: async () => true,
      execute: async ({ ticketId, status, reason }) => {
        return handlers.changeTicketStatus(ticketId, status, reason);
      }
    }),

    seedDemoData: tool({
      description:
        "Reset and seed demo support tickets. Requires approval because it overwrites demo data.",
      inputSchema: z.object({}),
      needsApproval: async () => true,
      execute: async () => {
        return handlers.seedDemoData();
      }
    })
  };
}
