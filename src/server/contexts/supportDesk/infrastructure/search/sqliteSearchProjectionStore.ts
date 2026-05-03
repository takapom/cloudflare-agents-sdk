import type { SearchProjectionStore } from "@/server/contexts/supportDesk/application/search/searchPorts";
import type { SqlQuery } from "@/server/contexts/supportDesk/supportDeskSql";

type SearchProjectionRow = {
  workspace_id: string;
  source_type: string;
  source_id: string;
  vector_id: string;
  content_hash: string;
  embedding_model: string;
  dimensions: number;
  indexed_at: string;
  source_updated_at: string;
};

export function createSqliteSearchProjectionStore(sql: SqlQuery): SearchProjectionStore {
  function initSchema() {
    sql`
      CREATE TABLE IF NOT EXISTS search_projection (
        workspace_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        vector_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        embedding_model TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        indexed_at TEXT NOT NULL,
        source_updated_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, source_type, source_id)
      )
    `;
  }

  return {
    initSchema,

    findBySource(workspaceId, sourceType, sourceId) {
      initSchema();

      const [row] = sql<SearchProjectionRow>`
        SELECT *
        FROM search_projection
        WHERE workspace_id = ${workspaceId}
          AND source_type = ${sourceType}
          AND source_id = ${sourceId}
        LIMIT 1
      `;

      if (!row) return undefined;

      return {
        vectorId: row.vector_id,
        contentHash: row.content_hash,
        embeddingModel: row.embedding_model
      };
    },

    markIndexed(input) {
      initSchema();

      sql`
        INSERT INTO search_projection (
          workspace_id,
          source_type,
          source_id,
          vector_id,
          content_hash,
          embedding_model,
          dimensions,
          indexed_at,
          source_updated_at
        ) VALUES (
          ${input.workspaceId},
          ${input.sourceType},
          ${input.sourceId},
          ${input.vectorId},
          ${input.contentHash},
          ${input.embeddingModel},
          ${input.dimensions},
          ${input.indexedAt},
          ${input.sourceUpdatedAt}
        )
        ON CONFLICT(workspace_id, source_type, source_id) DO UPDATE SET
          vector_id = excluded.vector_id,
          content_hash = excluded.content_hash,
          embedding_model = excluded.embedding_model,
          dimensions = excluded.dimensions,
          indexed_at = excluded.indexed_at,
          source_updated_at = excluded.source_updated_at
      `;
    },

    deleteBySource(workspaceId, sourceType, sourceId) {
      initSchema();

      sql`
        DELETE FROM search_projection
        WHERE workspace_id = ${workspaceId}
          AND source_type = ${sourceType}
          AND source_id = ${sourceId}
      `;
    }
  };
}
