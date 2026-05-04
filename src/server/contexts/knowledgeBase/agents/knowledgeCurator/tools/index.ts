import type { ToolSet } from "ai";
import type { KnowledgeBaseService } from "@/server/contexts/knowledgeBase/application/knowledgeBaseService";
import { createKnowledgeArticleTools } from "@/server/contexts/knowledgeBase/agents/knowledgeCurator/tools/articleTools";
import { createKnowledgeSuggestionTools } from "@/server/contexts/knowledgeBase/agents/knowledgeCurator/tools/suggestionTools";

export function createKnowledgeCuratorTools(
  handlers: KnowledgeBaseService
): ToolSet {
  return {
    ...createKnowledgeArticleTools(handlers),
    ...createKnowledgeSuggestionTools(handlers)
  };
}
