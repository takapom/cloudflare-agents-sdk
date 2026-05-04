import { tool } from "ai";
import { z } from "zod";
import type { KnowledgeBaseService } from "@/server/contexts/knowledgeBase/application/knowledgeBaseService";
import type { KnowledgeArticleDraft } from "@/server/contexts/knowledgeBase/domain/knowledgeArticle";

export type KnowledgeArticleToolHandlers = Pick<
  KnowledgeBaseService,
  "listArticles" | "getArticle" | "reviewArticleFreshness" | "proposeArticleDraft"
>;

export function createKnowledgeArticleTools(
  handlers: KnowledgeArticleToolHandlers
) {
  return {
    listKnowledgeArticles: tool({
      description: "List knowledge base article summaries.",
      inputSchema: z.object({}),
      execute: async () => handlers.listArticles()
    }),

    getKnowledgeArticle: tool({
      description: "Read one knowledge base article by id.",
      inputSchema: z.object({
        articleId: z.string()
      }),
      execute: async ({ articleId }) => handlers.getArticle(articleId)
    }),

    reviewArticleFreshness: tool({
      description: "Review article freshness and identify stale or draft articles.",
      inputSchema: z.object({
        staleAfterDays: z.number().int().positive().max(365).optional()
      }),
      execute: async (input) => handlers.reviewArticleFreshness(input)
    }),

    proposeArticleDraft: tool({
      description:
        "Propose a new or updated knowledge article draft. This is a change proposal and requires human approval.",
      inputSchema: z.object({
        title: z.string(),
        body: z.string(),
        tags: z.array(z.string()).default([]),
        sourceTicketIds: z.array(z.string()).default([])
      }),
      needsApproval: async () => true,
      execute: async (input: KnowledgeArticleDraft) =>
        handlers.proposeArticleDraft(input)
    })
  };
}
