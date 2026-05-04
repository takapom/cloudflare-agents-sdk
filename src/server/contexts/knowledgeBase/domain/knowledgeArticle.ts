export type KnowledgeArticleStatus = "draft" | "published" | "archived";

export type KnowledgeArticle = {
  id: string;
  title: string;
  body: string;
  tags: readonly string[];
  status: KnowledgeArticleStatus;
  updatedAt: string;
};

export type KnowledgeArticleSummary = Pick<
  KnowledgeArticle,
  "id" | "title" | "tags" | "status" | "updatedAt"
>;

export type KnowledgeArticleDraft = {
  title: string;
  body: string;
  tags: readonly string[];
  sourceTicketIds: readonly string[];
};

export type KnowledgeGapSuggestion = {
  title: string;
  summary: string;
  recommendedTags: readonly string[];
  sourceTicketIds: readonly string[];
  rationale: string;
};

export type DuplicateArticleCandidate = {
  articleId: string;
  title: string;
  reason: string;
};

export type ArticleFreshnessReview = {
  articleId: string;
  title: string;
  status: "fresh" | "stale" | "needsReview";
  reason: string;
};
