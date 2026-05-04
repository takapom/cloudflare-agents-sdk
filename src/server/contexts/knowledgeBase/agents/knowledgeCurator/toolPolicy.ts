const mutatingToolNames = new Set(["proposeArticleDraft"]);

export const readonlyKnowledgeCuratorToolNames: string[] = [
  "listKnowledgeArticles",
  "getKnowledgeArticle",
  "suggestFaqFromTickets",
  "detectDuplicateArticles",
  "reviewArticleFreshness"
];

export function isKnowledgeCuratorMutatingTool(toolName: string) {
  return mutatingToolNames.has(toolName);
}
