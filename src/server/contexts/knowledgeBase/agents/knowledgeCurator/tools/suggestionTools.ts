import { tool } from "ai";
import { z } from "zod";
import type { KnowledgeBaseService } from "@/server/contexts/knowledgeBase/application/knowledgeBaseService";

export type KnowledgeSuggestionToolHandlers = Pick<
  KnowledgeBaseService,
  "suggestFaqFromTickets" | "detectDuplicateArticles"
>;

export function createKnowledgeSuggestionTools(
  handlers: KnowledgeSuggestionToolHandlers
) {
  return {
    suggestFaqFromTickets: tool({
      description:
        "Suggest an FAQ candidate from support ticket summaries. This does not publish content.",
      inputSchema: z.object({
        ticketSummaries: z.array(z.string()).min(1),
        sourceTicketIds: z.array(z.string()).optional()
      }),
      execute: async (input) => handlers.suggestFaqFromTickets(input)
    }),

    detectDuplicateArticles: tool({
      description:
        "Find existing knowledge articles that may overlap with a proposed title or body.",
      inputSchema: z.object({
        title: z.string(),
        body: z.string().optional()
      }),
      execute: async (input) => handlers.detectDuplicateArticles(input)
    })
  };
}
