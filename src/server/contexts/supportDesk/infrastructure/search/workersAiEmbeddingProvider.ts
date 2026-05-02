import type { EmbeddingProvider } from "@/server/contexts/supportDesk/application/search/semanticSearchService";
import {
  SUPPORT_DESK_EMBEDDING_DIMENSIONS,
  SUPPORT_DESK_EMBEDDING_MODEL
} from "@/server/contexts/supportDesk/domain/search/searchDocument";
import type { Env } from "@/server/env";

type WorkersAiEmbeddingOutput = {
  shape?: number[];
  data?: number[][];
};

export function createWorkersAiEmbeddingProvider(env: Env): EmbeddingProvider {
  return {
    async embed(text: string) {
      const result = (await env.AI.run(SUPPORT_DESK_EMBEDDING_MODEL, {
        text
      })) as WorkersAiEmbeddingOutput;
      const values = result.data?.[0];

      if (!values || values.length === 0) {
        throw new Error("Workers AI embedding response did not include vector data.");
      }

      return {
        values,
        model: SUPPORT_DESK_EMBEDDING_MODEL,
        dimensions: result.shape?.[1] ?? values.length ?? SUPPORT_DESK_EMBEDDING_DIMENSIONS
      };
    }
  };
}
