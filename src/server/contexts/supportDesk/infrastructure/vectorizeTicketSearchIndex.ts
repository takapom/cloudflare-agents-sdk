import type {
  TicketPriorityFilter,
  TicketStatusFilter
} from "@/shared/contracts";
import type {
  TicketSearchIndex,
  TicketSearchMatch
} from "@/server/contexts/supportDesk/application/semanticSearchService";
import type { Env } from "@/server/env";

function normalizeMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return metadata as Record<string, unknown>;
}

function buildFilter(input: {
  status?: TicketStatusFilter;
  priority?: TicketPriorityFilter;
}): VectorizeVectorMetadataFilter | undefined {
  const filter: VectorizeVectorMetadataFilter = {};

  if (input.status && input.status !== "all") {
    filter.status = input.status;
  }

  if (input.priority && input.priority !== "all") {
    filter.priority = input.priority;
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
}

export function createVectorizeTicketSearchIndex(env: Env): TicketSearchIndex {
  return {
    async upsert(input) {
      return env.SUPPORT_DESK_VECTORIZE.upsert([
        {
          id: input.id,
          values: input.values,
          namespace: input.namespace,
          metadata: input.metadata
        }
      ]);
    },

    async query(input): Promise<TicketSearchMatch[]> {
      const result = await env.SUPPORT_DESK_VECTORIZE.query(input.values, {
        topK: input.topK,
        namespace: input.namespace,
        returnMetadata: "all",
        filter: buildFilter(input)
      });

      return result.matches.map((match) => ({
        id: match.id,
        score: match.score,
        metadata: normalizeMetadata(match.metadata)
      }));
    },

    async deleteByIds(ids: string[]) {
      return env.SUPPORT_DESK_VECTORIZE.deleteByIds(ids);
    }
  };
}
