import { tool, type ToolSet } from "ai";
import type {
  TicketPriorityFilter,
  TicketStatusFilter
} from "@/shared/contracts";
import {
  reindexSearchInputSchema,
  semanticSearchTicketsInputSchema
} from "@/server/contexts/supportDesk/ai/semanticSearchSchemas";

export type SemanticSearchToolHandlers = {
  semanticSearchTickets: (input: {
    query: string;
    status?: TicketStatusFilter;
    priority?: TicketPriorityFilter;
    limit?: number;
  }) => Promise<unknown>;
  reindexSearch: (input: {
    status?: TicketStatusFilter;
    priority?: TicketPriorityFilter;
    limit?: number;
  }) => Promise<unknown>;
};

export function createSemanticSearchTools(
  handlers: SemanticSearchToolHandlers
): ToolSet {
  return {
    semanticSearchTickets: tool({
      description:
        "Find semantically similar support tickets using Workers AI embeddings and Vectorize. Read-only.",
      inputSchema: semanticSearchTicketsInputSchema,
      execute: async ({ query, status, priority, limit }) => {
        return handlers.semanticSearchTickets({ query, status, priority, limit });
      }
    }),

    reindexSearch: tool({
      description:
        "Rebuild the semantic search index for tickets in this tenant. Requires approval because it writes Vectorize index data and consumes embedding quota.",
      inputSchema: reindexSearchInputSchema,
      needsApproval: async () => true,
      execute: async ({ status, priority, limit }) => {
        return handlers.reindexSearch({ status, priority, limit });
      }
    })
  };
}
