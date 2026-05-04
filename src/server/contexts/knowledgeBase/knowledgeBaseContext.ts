import { createKnowledgeBaseService } from "@/server/contexts/knowledgeBase/application/knowledgeBaseService";
import { demoKnowledgeArticles } from "@/server/contexts/knowledgeBase/fixtures/demoKnowledgeArticles";

export function createKnowledgeBaseContext(options?: { now?: Date }) {
  return {
    articles: createKnowledgeBaseService({
      articles: demoKnowledgeArticles,
      now: options?.now ?? new Date()
    })
  };
}
