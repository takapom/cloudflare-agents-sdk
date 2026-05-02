import type { TicketPriority, TicketStatus } from "@/shared/contracts";

export type TicketRow = {
  id: string;
  customer_name: string;
  customer_email: string;
  subject: string;
  body: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  tags_json: string;
  created_at: string;
  updated_at: string;
};

export type NoteRow = {
  id: string;
  ticket_id: string;
  body: string;
  created_by: string;
  created_at: string;
};

export type DraftRow = {
  id: string;
  ticket_id: string;
  subject: string;
  body: string;
  tone: string;
  created_at: string;
};

export type AuditLogRow = {
  action: string;
  target_id: string;
  created_at: string;
};

export type CountRow<T extends string = string> = {
  name: T;
  count: number;
};
