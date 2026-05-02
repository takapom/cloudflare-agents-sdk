import type { TicketView } from "@/shared/contracts";

export const SUPPORT_DESK_EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
export const SUPPORT_DESK_EMBEDDING_DIMENSIONS = 768;

export type SearchSourceType = "ticket";

export type TicketSearchMetadata = {
  workspaceId: string;
  sourceType: SearchSourceType;
  sourceId: string;
  ticketId: string;
  status: string;
  priority: string;
  category: string;
  subject: string;
  updatedAt: string;
};

export type TicketSearchDocument = {
  id: string;
  workspaceId: string;
  sourceType: SearchSourceType;
  sourceId: string;
  text: string;
  metadata: TicketSearchMetadata;
};

export function buildTicketSearchDocument(
  workspaceId: string,
  ticket: TicketView
): TicketSearchDocument {
  const text = [
    `Subject: ${ticket.subject}`,
    `Customer: ${ticket.customerName} <${ticket.customerEmail}>`,
    `Status: ${ticket.status}`,
    `Priority: ${ticket.priority}`,
    `Category: ${ticket.category}`,
    `Tags: ${ticket.tags.join(", ")}`,
    "",
    ticket.body
  ].join("\n");

  return {
    id: `ticket:${workspaceId}:${ticket.id}:main`,
    workspaceId,
    sourceType: "ticket",
    sourceId: ticket.id,
    text,
    metadata: {
      workspaceId,
      sourceType: "ticket",
      sourceId: ticket.id,
      ticketId: ticket.id,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      subject: ticket.subject,
      updatedAt: ticket.updatedAt
    }
  };
}
