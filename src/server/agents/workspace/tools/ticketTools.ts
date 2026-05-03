import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type {
  TicketPriorityFilter,
  TicketStatus,
  TicketStatusFilter
} from "@/shared/contracts";
import { ticketStatusSchema } from "@/server/agents/workspace/tools/ticketSchemas";

export type TicketToolHandlers = {
  listTickets: (
    status: TicketStatusFilter,
    priority: TicketPriorityFilter,
    limit: number
  ) => unknown;
  getTicket: (ticketId: string) => unknown;
  searchTickets: (query: string, limit: number) => unknown;
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
};

export function createReadOnlyTicketTools(handlers: TicketToolHandlers): ToolSet {
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
  };
}

export function createTicketMutationTools(handlers: TicketToolHandlers): ToolSet {
  return {
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
