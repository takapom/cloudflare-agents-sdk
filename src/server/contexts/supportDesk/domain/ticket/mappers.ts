import type { TicketView } from "@/shared/contracts";
import type { TicketRow } from "@/server/contexts/supportDesk/domain/ticket/rows";

export function toTicketView(row: TicketRow): TicketView {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    subject: row.subject,
    body: row.body,
    status: row.status,
    priority: row.priority,
    category: row.category,
    tags: JSON.parse(row.tags_json) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
