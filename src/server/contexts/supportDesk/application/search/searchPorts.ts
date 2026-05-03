import type {
  TicketPriorityFilter,
  TicketStatusFilter,
  TicketView
} from "@/shared/contracts";

export type EmbeddingResult = {
  values: number[];
  model: string;
  dimensions: number;
};

export type EmbeddingProvider = {
  embed(text: string): Promise<EmbeddingResult>;
};

export type TicketSearchMatch = {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
};

export type TicketSearchIndex = {
  upsert(input: {
    id: string;
    values: number[];
    namespace: string;
    metadata: Record<string, string | number | boolean | string[]>;
  }): Promise<unknown>;
  query(input: {
    values: number[];
    namespace: string;
    topK: number;
    status?: TicketStatusFilter;
    priority?: TicketPriorityFilter;
  }): Promise<TicketSearchMatch[]>;
  deleteByIds(ids: string[]): Promise<unknown>;
};

export type SearchProjectionStore = {
  initSchema(): void;
  findBySource(workspaceId: string, sourceType: string, sourceId: string):
    | {
        vectorId: string;
        contentHash: string;
        embeddingModel: string;
      }
    | undefined;
  markIndexed(input: {
    workspaceId: string;
    sourceType: string;
    sourceId: string;
    vectorId: string;
    contentHash: string;
    embeddingModel: string;
    dimensions: number;
    indexedAt: string;
    sourceUpdatedAt: string;
  }): void;
  deleteBySource(workspaceId: string, sourceType: string, sourceId: string): void;
};

export type SemanticSearchTicketRepository = {
  listTickets(
    status: TicketStatusFilter,
    priority: TicketPriorityFilter,
    limit: number
  ): TicketView[];
  getTicket(ticketId: string): { ok: true; ticket: TicketView } | { ok: false; error: string };
};
