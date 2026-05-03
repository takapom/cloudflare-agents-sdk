import type {
  TicketPriorityFilter,
  TicketStatusFilter,
  TicketView
} from "@/shared/contracts";
import {
  buildTicketSearchDocument,
  SUPPORT_DESK_EMBEDDING_MODEL
} from "@/server/contexts/supportDesk/domain/search/searchDocument";
import type {
  EmbeddingProvider,
  SearchProjectionStore,
  SemanticSearchTicketRepository,
  TicketSearchIndex
} from "@/server/contexts/supportDesk/application/search/searchPorts";

export type SemanticTicketSearchResult = {
  ok: true;
  query: string;
  indexedQueryModel: string;
  matches: Array<{
    score: number;
    ticket: TicketView;
    metadata: Record<string, unknown>;
  }>;
};

async function hashText(text: string) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function createSemanticSearchService(input: {
  workspaceId: string;
  ticketRepository: SemanticSearchTicketRepository;
  projectionStore: SearchProjectionStore;
  embeddingProvider: EmbeddingProvider;
  searchIndex: TicketSearchIndex;
}) {
  const {
    workspaceId,
    ticketRepository,
    projectionStore,
    embeddingProvider,
    searchIndex
  } = input;

  async function indexTicket(ticketId: string) {
    projectionStore.initSchema();

    const result = ticketRepository.getTicket(ticketId);
    if (!result.ok) return result;

    const document = buildTicketSearchDocument(workspaceId, result.ticket);
    const contentHash = await hashText(document.text);
    const existing = projectionStore.findBySource(
      workspaceId,
      document.sourceType,
      document.sourceId
    );

    if (
      existing?.contentHash === contentHash &&
      existing.embeddingModel === SUPPORT_DESK_EMBEDDING_MODEL
    ) {
      return {
        ok: true,
        indexed: false,
        skipped: true,
        reason: "unchanged",
        ticketId,
        vectorId: existing.vectorId
      };
    }

    const embedding = await embeddingProvider.embed(document.text);

    await searchIndex.upsert({
      id: document.id,
      values: embedding.values,
      namespace: workspaceId,
      metadata: document.metadata
    });

    projectionStore.markIndexed({
      workspaceId,
      sourceType: document.sourceType,
      sourceId: document.sourceId,
      vectorId: document.id,
      contentHash,
      embeddingModel: embedding.model,
      dimensions: embedding.dimensions,
      indexedAt: new Date().toISOString(),
      sourceUpdatedAt: result.ticket.updatedAt
    });

    return {
      ok: true,
      indexed: true,
      skipped: false,
      ticketId,
      vectorId: document.id,
      embeddingModel: embedding.model
    };
  }

  async function reindexTickets(input?: {
    status?: TicketStatusFilter;
    priority?: TicketPriorityFilter;
    limit?: number;
  }) {
    const status = input?.status ?? "all";
    const priority = input?.priority ?? "all";
    const limit = Math.min(Math.max(input?.limit ?? 50, 1), 100);
    const tickets = ticketRepository.listTickets(status, priority, limit);
    const results = [];

    for (const ticket of tickets) {
      results.push(await indexTicket(ticket.id));
    }

    return {
      ok: true,
      workspaceId,
      requested: tickets.length,
      indexed: results.filter((result) => result.ok && "indexed" in result && result.indexed).length,
      skipped: results.filter((result) => result.ok && "skipped" in result && result.skipped).length,
      results
    };
  }

  async function searchSimilarTickets(input: {
    query: string;
    status?: TicketStatusFilter;
    priority?: TicketPriorityFilter;
    limit?: number;
  }): Promise<SemanticTicketSearchResult> {
    const limit = Math.min(Math.max(input.limit ?? 8, 1), 20);
    const embedding = await embeddingProvider.embed(input.query);
    const matches = await searchIndex.query({
      values: embedding.values,
      namespace: workspaceId,
      topK: limit,
      status: input.status ?? "all",
      priority: input.priority ?? "all"
    });

    const hydrated = matches
      .map((match) => {
        const ticketId =
          typeof match.metadata.ticketId === "string" ? match.metadata.ticketId : match.id;
        const ticketResult = ticketRepository.getTicket(ticketId);
        if (!ticketResult.ok) return null;

        return {
          score: match.score,
          ticket: ticketResult.ticket,
          metadata: match.metadata
        };
      })
      .filter((match): match is NonNullable<typeof match> => match !== null);

    return {
      ok: true,
      query: input.query,
      indexedQueryModel: embedding.model,
      matches: hydrated
    };
  }

  async function deleteTicketSearchIndex(ticketId: string) {
    projectionStore.initSchema();
    const existing = projectionStore.findBySource(workspaceId, "ticket", ticketId);
    if (!existing) {
      return { ok: true, deleted: false, reason: "not-indexed", ticketId };
    }

    await searchIndex.deleteByIds([existing.vectorId]);
    projectionStore.deleteBySource(workspaceId, "ticket", ticketId);

    return {
      ok: true,
      deleted: true,
      ticketId,
      vectorId: existing.vectorId
    };
  }

  return {
    indexTicket,
    reindexTickets,
    searchSimilarTickets,
    deleteTicketSearchIndex
  };
}
