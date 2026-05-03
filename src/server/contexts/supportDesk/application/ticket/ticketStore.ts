import type {
  SupportDeskState,
  TenantOverview,
  TicketPriorityFilter,
  TicketStatus,
  TicketStatusFilter,
  TicketView
} from "@/shared/contracts";

export type TicketLookupResult =
  | {
      ok: true;
      ticket: TicketView;
      notes: Array<{
        id: string;
        ticketId: string;
        body: string;
        createdBy: string;
        createdAt: string;
      }>;
      drafts: Array<{
        id: string;
        ticketId: string;
        subject: string;
        body: string;
        tone: string;
        createdAt: string;
      }>;
    }
  | { ok: false; error: string };

export type TicketStore = {
  initSchema(): void;
  seedDemoData(options?: { reset?: boolean }): {
    ok: true;
    seeded: number;
    reset: boolean;
  };
  getTicketCount(): number;
  getMetricCounts(): {
    openTicketCount: number;
    urgentTicketCount: number;
  };
  getTenantOverview(state: SupportDeskState): TenantOverview;
  listTickets(
    status?: TicketStatusFilter,
    priority?: TicketPriorityFilter,
    limit?: number
  ): TicketView[];
  getTicket(ticketId: string): TicketLookupResult;
  searchTickets(query: string, limit?: number): TicketView[];
  addInternalNote(
    ticketId: string,
    body: string,
    createdBy?: string
  ):
    | {
        ok: true;
        id: string;
        ticketId: string;
        body: string;
        createdBy: string;
        createdAt: string;
      }
    | { ok: false; error: string };
  changeTicketStatus(
    ticketId: string,
    status: TicketStatus,
    reason: string
  ):
    | {
        ok: true;
        ticketId: string;
        status: TicketStatus;
        reason: string;
        updatedAt: string;
      }
    | { ok: false; error: string };
  saveDraft(
    ticketId: string,
    subject: string,
    body: string,
    tone: string
  ): {
    ok: true;
    draftId: string;
    ticketId: string;
    savedAt: string;
  };
};
