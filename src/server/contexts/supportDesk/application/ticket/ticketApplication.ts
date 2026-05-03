import type {
  SupportDeskState,
  TicketPriorityFilter,
  TicketStatus,
  TicketStatusFilter
} from "@/shared/contracts";
import type { TicketStore } from "@/server/contexts/supportDesk/application/ticket/ticketStore";

export function createTicketApplication(store: TicketStore) {
  return {
    initSchema() {
      store.initSchema();
    },

    seedDemoData(options?: { reset?: boolean }) {
      return store.seedDemoData(options);
    },

    getTicketCount() {
      return store.getTicketCount();
    },

    getMetricCounts() {
      return store.getMetricCounts();
    },

    getTenantOverview(state: SupportDeskState) {
      return store.getTenantOverview(state);
    },

    listTickets(
      status: TicketStatusFilter = "open",
      priority: TicketPriorityFilter = "all",
      limit = 10
    ) {
      return store.listTickets(status, priority, limit);
    },

    getTicket(ticketId: string) {
      return store.getTicket(ticketId);
    },

    searchTickets(query: string, limit = 10) {
      return store.searchTickets(query, limit);
    },

    addInternalNote(ticketId: string, body: string, createdBy = "human") {
      return store.addInternalNote(ticketId, body, createdBy);
    },

    changeTicketStatus(ticketId: string, status: TicketStatus, reason: string) {
      return store.changeTicketStatus(ticketId, status, reason);
    },

    saveDraft(ticketId: string, subject: string, body: string, tone: string) {
      return store.saveDraft(ticketId, subject, body, tone);
    }
  };
}
