import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type {
  TicketPriorityFilter,
  TicketStatusFilter
} from "@/shared/contracts";

export type AnalyticsToolHandlers = {
  runDynamicWorkerTicketAnalytics: (input: {
    status?: TicketStatusFilter;
    priority?: TicketPriorityFilter;
    limit?: number;
  }) => Promise<unknown>;
};

export function createAnalyticsTools(handlers: AnalyticsToolHandlers): ToolSet {
  return {
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
    })
  };
}
