import type {
  SupportDeskState,
  TenantOverview,
  TicketPriority,
  TicketPriorityFilter,
  TicketStatus,
  TicketStatusFilter
} from "@/shared/contracts";
import { nowIso } from "@/server/utils/time";
import { demoTickets } from "@/server/contexts/supportDesk/domain/ticket/demoTickets";
import { toTicketView } from "@/server/contexts/supportDesk/domain/ticket/mappers";
import type { AuditLogRow, CountRow, DraftRow, NoteRow, TicketRow } from "@/server/contexts/supportDesk/domain/ticket/rows";

export type SqlQuery = <T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: any[]
) => T[];

export type SupportDeskStore = ReturnType<typeof createSupportDeskStore>;

export function createSupportDeskStore(sql: SqlQuery, workspaceName: string) {
  function initSchema() {
    sql`
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        category TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;

    sql`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        body TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `;

    sql`
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        tone TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `;

    sql`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        target_id TEXT NOT NULL,
        detail_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `;
  }

  function recordAuditLog(action: string, targetId: string, detail: unknown, createdAt = nowIso()) {
    sql`
      INSERT INTO audit_log (id, action, target_id, detail_json, created_at)
      VALUES (${crypto.randomUUID()}, ${action}, ${targetId}, ${JSON.stringify(detail)}, ${createdAt})
    `;
  }

  function seedDemoData(options?: { reset?: boolean }) {
    initSchema();

    if (options?.reset) {
      sql`DELETE FROM notes`;
      sql`DELETE FROM drafts`;
      sql`DELETE FROM audit_log`;
      sql`DELETE FROM tickets`;
    }

    const createdAt = nowIso();

    for (const ticket of demoTickets) {
      sql`
        INSERT INTO tickets (
          id,
          customer_name,
          customer_email,
          subject,
          body,
          status,
          priority,
          category,
          tags_json,
          created_at,
          updated_at
        ) VALUES (
          ${ticket.id},
          ${ticket.customerName},
          ${ticket.customerEmail},
          ${ticket.subject},
          ${ticket.body},
          ${ticket.status},
          ${ticket.priority},
          ${ticket.category},
          ${JSON.stringify(ticket.tags)},
          ${createdAt},
          ${createdAt}
        )
        ON CONFLICT(id) DO UPDATE SET
          customer_name = excluded.customer_name,
          customer_email = excluded.customer_email,
          subject = excluded.subject,
          body = excluded.body,
          status = excluded.status,
          priority = excluded.priority,
          category = excluded.category,
          tags_json = excluded.tags_json,
          updated_at = excluded.updated_at
      `;
    }

    recordAuditLog("seedDemoData", "workspace", { reset: Boolean(options?.reset) }, createdAt);

    return {
      ok: true,
      seeded: demoTickets.length,
      reset: Boolean(options?.reset)
    };
  }

  function getTicketCount() {
    const [{ count }] = sql<{ count: number }>`SELECT COUNT(*) AS count FROM tickets`;
    return count;
  }

  function getMetricCounts() {
    const [open] = sql<{ count: number }>`
      SELECT COUNT(*) AS count
      FROM tickets
      WHERE status IN ('open', 'pending')
    `;

    const [urgent] = sql<{ count: number }>`
      SELECT COUNT(*) AS count
      FROM tickets
      WHERE priority = 'urgent' AND status != 'resolved'
    `;

    return {
      openTicketCount: open?.count ?? 0,
      urgentTicketCount: urgent?.count ?? 0
    };
  }

  function getTenantOverview(state: SupportDeskState): TenantOverview {
    initSchema();

    const [tickets] = sql<{ count: number }>`SELECT COUNT(*) AS count FROM tickets`;
    const [notes] = sql<{ count: number }>`SELECT COUNT(*) AS count FROM notes`;
    const [drafts] = sql<{ count: number }>`SELECT COUNT(*) AS count FROM drafts`;
    const [auditLog] = sql<{ count: number }>`SELECT COUNT(*) AS count FROM audit_log`;
    const [openOrPending] = sql<{ count: number }>`
      SELECT COUNT(*) AS count
      FROM tickets
      WHERE status IN ('open', 'pending')
    `;
    const [urgent] = sql<{ count: number }>`
      SELECT COUNT(*) AS count
      FROM tickets
      WHERE priority = 'urgent' AND status != 'resolved'
    `;

    const byStatusRows = sql<CountRow<TicketStatus>>`
      SELECT status AS name, COUNT(*) AS count
      FROM tickets
      GROUP BY status
    `;
    const byPriorityRows = sql<CountRow<TicketPriority>>`
      SELECT priority AS name, COUNT(*) AS count
      FROM tickets
      GROUP BY priority
    `;
    const byCategoryRows = sql<CountRow>`
      SELECT category AS name, COUNT(*) AS count
      FROM tickets
      GROUP BY category
      ORDER BY count DESC, category ASC
    `;
    const latestTickets = sql<TicketRow>`
      SELECT *
      FROM tickets
      ORDER BY updated_at DESC
      LIMIT 5
    `;
    const latestAuditLog = sql<AuditLogRow>`
      SELECT action, target_id, created_at
      FROM audit_log
      ORDER BY created_at DESC
      LIMIT 5
    `;

    return {
      tenantId: workspaceName,
      durableObjectClass: "SupportDeskAgent",
      storageBackend: "sqlite",
      mode: state.mode,
      seeded: state.seeded,
      counts: {
        tickets: tickets?.count ?? 0,
        notes: notes?.count ?? 0,
        drafts: drafts?.count ?? 0,
        auditLog: auditLog?.count ?? 0,
        openOrPending: openOrPending?.count ?? 0,
        urgent: urgent?.count ?? 0
      },
      byStatus: {
        open: byStatusRows.find((row) => row.name === "open")?.count ?? 0,
        pending: byStatusRows.find((row) => row.name === "pending")?.count ?? 0,
        resolved: byStatusRows.find((row) => row.name === "resolved")?.count ?? 0
      },
      byPriority: {
        low: byPriorityRows.find((row) => row.name === "low")?.count ?? 0,
        medium: byPriorityRows.find((row) => row.name === "medium")?.count ?? 0,
        high: byPriorityRows.find((row) => row.name === "high")?.count ?? 0,
        urgent: byPriorityRows.find((row) => row.name === "urgent")?.count ?? 0
      },
      byCategory: Object.fromEntries(
        byCategoryRows.map((row) => [row.name, row.count])
      ),
      latestTickets: latestTickets.map((ticket) => ({
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        updatedAt: ticket.updated_at
      })),
      latestAuditLog: latestAuditLog.map((row) => ({
        action: row.action,
        targetId: row.target_id,
        createdAt: row.created_at
      }))
    };
  }

  function listTickets(
    status: TicketStatusFilter = "open",
    priority: TicketPriorityFilter = "all",
    limit = 10
  ) {
    initSchema();

    const rows = sql<TicketRow>`
      SELECT *
      FROM tickets
      WHERE (${status} = 'all' OR status = ${status})
        AND (${priority} = 'all' OR priority = ${priority})
      ORDER BY
        CASE priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        updated_at DESC
      LIMIT ${limit}
    `;

    return rows.map(toTicketView);
  }

  function getTicket(ticketId: string) {
    initSchema();

    const [row] = sql<TicketRow>`
      SELECT *
      FROM tickets
      WHERE id = ${ticketId}
      LIMIT 1
    `;

    if (!row) {
      return { ok: false as const, error: `Ticket ${ticketId} not found.` };
    }

    const notes = sql<NoteRow>`
      SELECT *
      FROM notes
      WHERE ticket_id = ${ticketId}
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const drafts = sql<DraftRow>`
      SELECT *
      FROM drafts
      WHERE ticket_id = ${ticketId}
      ORDER BY created_at DESC
      LIMIT 5
    `;

    return {
      ok: true as const,
      ticket: toTicketView(row),
      notes: notes.map((note) => ({
        id: note.id,
        ticketId: note.ticket_id,
        body: note.body,
        createdBy: note.created_by,
        createdAt: note.created_at
      })),
      drafts: drafts.map((draft) => ({
        id: draft.id,
        ticketId: draft.ticket_id,
        subject: draft.subject,
        body: draft.body,
        tone: draft.tone,
        createdAt: draft.created_at
      }))
    };
  }

  function searchTickets(query: string, limit = 10) {
    initSchema();
    const like = `%${query.toLowerCase()}%`;

    const rows = sql<TicketRow>`
      SELECT *
      FROM tickets
      WHERE lower(subject) LIKE ${like}
         OR lower(body) LIKE ${like}
         OR lower(category) LIKE ${like}
         OR lower(tags_json) LIKE ${like}
      ORDER BY updated_at DESC
      LIMIT ${limit}
    `;

    return rows.map(toTicketView);
  }

  function addInternalNote(ticketId: string, body: string, createdBy = "human") {
    initSchema();

    const ticket = getTicket(ticketId);
    if (!ticket.ok) return ticket;

    const id = crypto.randomUUID();
    const createdAt = nowIso();

    sql`
      INSERT INTO notes (id, ticket_id, body, created_by, created_at)
      VALUES (${id}, ${ticketId}, ${body}, ${createdBy}, ${createdAt})
    `;

    sql`
      UPDATE tickets
      SET updated_at = ${createdAt}
      WHERE id = ${ticketId}
    `;

    recordAuditLog("addInternalNote", ticketId, { body, createdBy }, createdAt);

    return {
      ok: true as const,
      id,
      ticketId,
      body,
      createdBy,
      createdAt
    };
  }

  function changeTicketStatus(ticketId: string, status: TicketStatus, reason: string) {
    initSchema();

    const ticket = getTicket(ticketId);
    if (!ticket.ok) return ticket;

    const updatedAt = nowIso();

    sql`
      UPDATE tickets
      SET status = ${status}, updated_at = ${updatedAt}
      WHERE id = ${ticketId}
    `;

    recordAuditLog("changeTicketStatus", ticketId, { status, reason }, updatedAt);

    return {
      ok: true as const,
      ticketId,
      status,
      reason,
      updatedAt
    };
  }

  function saveDraft(ticketId: string, subject: string, body: string, tone: string) {
    initSchema();

    const id = crypto.randomUUID();
    const createdAt = nowIso();

    sql`
      INSERT INTO drafts (id, ticket_id, subject, body, tone, created_at)
      VALUES (${id}, ${ticketId}, ${subject}, ${body}, ${tone}, ${createdAt})
    `;

    recordAuditLog("draftReplyWithSubAgent", ticketId, { draftId: id, tone }, createdAt);

    return {
      ok: true as const,
      draftId: id,
      ticketId,
      savedAt: createdAt
    };
  }

  return {
    initSchema,
    seedDemoData,
    getTicketCount,
    getMetricCounts,
    getTenantOverview,
    listTickets,
    getTicket,
    searchTickets,
    addInternalNote,
    changeTicketStatus,
    saveDraft
  };
}
