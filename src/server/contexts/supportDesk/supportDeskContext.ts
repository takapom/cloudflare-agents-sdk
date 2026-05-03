import type { Env } from "@/server/platform/env";
import { createTicketAnalyticsService } from "@/server/contexts/supportDesk/application/analytics/ticketAnalyticsService";
import { createSemanticSearchService } from "@/server/contexts/supportDesk/application/search/semanticSearchService";
import { createTicketApplication } from "@/server/contexts/supportDesk/application/ticket/ticketApplication";
import { createDynamicWorkerTicketAnalyticsRunner } from "@/server/contexts/supportDesk/infrastructure/analytics/dynamicWorkerTicketAnalytics";
import { createSqliteSearchProjectionStore } from "@/server/contexts/supportDesk/infrastructure/search/sqliteSearchProjectionStore";
import { createVectorizeTicketSearchIndex } from "@/server/contexts/supportDesk/infrastructure/search/vectorizeTicketSearchIndex";
import { createWorkersAiEmbeddingProvider } from "@/server/contexts/supportDesk/infrastructure/search/workersAiEmbeddingProvider";
import {
  createSupportDeskStore
} from "@/server/contexts/supportDesk/infrastructure/ticket/sqliteTicketStore";
import type { SqlQuery } from "@/server/contexts/supportDesk/supportDeskSql";

export type { SqlQuery } from "@/server/contexts/supportDesk/supportDeskSql";

export function createSupportDeskContext(input: {
  env: Env;
  sql: SqlQuery;
  workspaceId: string;
}) {
  const ticketApplication = createTicketApplication(
    createSupportDeskStore(input.sql, input.workspaceId)
  );

  return {
    tickets: ticketApplication,
    analytics: createTicketAnalyticsService({
      ticketRepository: ticketApplication,
      analyticsRunner: createDynamicWorkerTicketAnalyticsRunner(input.env)
    }),
    search: createSemanticSearchService({
      workspaceId: input.workspaceId,
      ticketRepository: ticketApplication,
      projectionStore: createSqliteSearchProjectionStore(input.sql),
      embeddingProvider: createWorkersAiEmbeddingProvider(input.env),
      searchIndex: createVectorizeTicketSearchIndex(input.env)
    })
  };
}
