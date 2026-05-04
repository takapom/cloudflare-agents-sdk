import type {
  ArticleFreshnessReview,
  DuplicateArticleCandidate,
  KnowledgeArticle,
  KnowledgeArticleDraft,
  KnowledgeArticleSummary,
  KnowledgeGapSuggestion
} from "@/server/contexts/knowledgeBase/domain/knowledgeArticle";

export type KnowledgeBaseService = {
  listArticles(): readonly KnowledgeArticleSummary[];
  getArticle(articleId: string): KnowledgeArticle | undefined;
  suggestFaqFromTickets(input: {
    ticketSummaries: readonly string[];
    sourceTicketIds?: readonly string[];
  }): KnowledgeGapSuggestion;
  detectDuplicateArticles(input: {
    title: string;
    body?: string;
  }): readonly DuplicateArticleCandidate[];
  reviewArticleFreshness(input?: {
    staleAfterDays?: number;
  }): readonly ArticleFreshnessReview[];
  proposeArticleDraft(input: KnowledgeArticleDraft): KnowledgeArticleDraft;
};

export function createKnowledgeBaseService(options: {
  articles: readonly KnowledgeArticle[];
  now: Date;
}): KnowledgeBaseService {
  const articles = options.articles;

  return {
    listArticles() {
      return articles.map(({ id, title, tags, status, updatedAt }) => ({
        id,
        title,
        tags,
        status,
        updatedAt
      }));
    },

    getArticle(articleId) {
      return articles.find((article) => article.id === articleId);
    },

    suggestFaqFromTickets(input) {
      const joined = input.ticketSummaries.join("\n").trim();
      const firstLine = joined.split("\n").find(Boolean) ?? "問い合わせ内容";

      return {
        title: `FAQ候補: ${firstLine.slice(0, 48)}`,
        summary: joined.slice(0, 600),
        recommendedTags: inferTags(joined),
        sourceTicketIds: input.sourceTicketIds ?? [],
        rationale:
          "複数の問い合わせから再利用できる回答手順を作れる可能性があります。"
      };
    },

    detectDuplicateArticles(input) {
      const query = `${input.title} ${input.body ?? ""}`.toLowerCase();
      const queryTokens = tokenize(query);

      return articles
        .map((article) => {
          const articleTokens = tokenize(`${article.title} ${article.body}`);
          const sharedTokens = queryTokens.filter((token) =>
            articleTokens.includes(token)
          );

          return {
            article,
            score: new Set(sharedTokens).size
          };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(({ article, score }) => ({
          articleId: article.id,
          title: article.title,
          reason: `${score}個の語彙が一致しました。`
        }));
    },

    reviewArticleFreshness(input) {
      const staleAfterDays = input?.staleAfterDays ?? 60;

      return articles.map((article) => {
        const ageDays = Math.floor(
          (options.now.getTime() - new Date(article.updatedAt).getTime()) /
            (1000 * 60 * 60 * 24)
        );

        if (article.status === "draft") {
          return {
            articleId: article.id,
            title: article.title,
            status: "needsReview",
            reason: "draft状態のため公開可否の確認が必要です。"
          };
        }

        if (ageDays > staleAfterDays) {
          return {
            articleId: article.id,
            title: article.title,
            status: "stale",
            reason: `${ageDays}日更新されていません。`
          };
        }

        return {
          articleId: article.id,
          title: article.title,
          status: "fresh",
          reason: `${ageDays}日前に更新されています。`
        };
      });
    },

    proposeArticleDraft(input) {
      return input;
    }
  };
}

function inferTags(text: string): readonly string[] {
  const normalized = text.toLowerCase();
  const tags = new Set<string>();

  if (normalized.includes("refund") || normalized.includes("返金")) {
    tags.add("billing");
    tags.add("refund");
  }

  if (normalized.includes("login") || normalized.includes("ログイン")) {
    tags.add("account");
    tags.add("login");
  }

  if (normalized.includes("sla") || normalized.includes("urgent")) {
    tags.add("sla");
    tags.add("escalation");
  }

  return [...tags].length > 0 ? [...tags] : ["faq"];
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[\s、。,.!?/()（）「」]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}
