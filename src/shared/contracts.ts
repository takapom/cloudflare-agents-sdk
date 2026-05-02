export type TicketStatus = "open" | "pending" | "resolved";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type DeskMode = "normal" | "readonly";

export type SupportDeskState = {
  workspaceId: string;
  mode: DeskMode;
  seeded: boolean;
  openTicketCount: number;
  urgentTicketCount: number;
  lastActivityAt: string | null;
  lastError: string | null;
};

export type TicketView = {
  id: string;
  customerName: string;
  customerEmail: string;
  subject: string;
  body: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type TenantOverview = {
  tenantId: string;
  durableObjectClass: "SupportDeskAgent";
  storageBackend: "sqlite";
  mode: DeskMode;
  seeded: boolean;
  counts: {
    tickets: number;
    notes: number;
    drafts: number;
    auditLog: number;
    openOrPending: number;
    urgent: number;
  };
  byStatus: Record<TicketStatus, number>;
  byPriority: Record<TicketPriority, number>;
  byCategory: Record<string, number>;
  latestTickets: Array<{
    id: string;
    subject: string;
    status: TicketStatus;
    priority: TicketPriority;
    updatedAt: string;
  }>;
  latestAuditLog: Array<{
    action: string;
    targetId: string;
    createdAt: string;
  }>;
};

export type TicketStatusFilter = TicketStatus | "all";
export type TicketPriorityFilter = TicketPriority | "all";
export type DraftTone = "friendly" | "formal" | "apologetic" | "concise";
