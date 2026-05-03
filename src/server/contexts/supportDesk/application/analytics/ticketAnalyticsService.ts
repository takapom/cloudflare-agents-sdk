import type {
  TicketPriorityFilter,
  TicketStatusFilter,
  TicketView
} from "@/shared/contracts";

export type TicketAnalyticsRepository = {
  listTickets(
    status: TicketStatusFilter,
    priority: TicketPriorityFilter,
    limit: number
  ): TicketView[];
};

export type TicketAnalyticsRunner = {
  run(input: { tickets: TicketView[] }): Promise<unknown>;
};

export function normalizeAnalyticsInput(input?: {
  status?: TicketStatusFilter;
  priority?: TicketPriorityFilter;
  limit?: number;
}) {
  return {
    status: input?.status ?? "all",
    priority: input?.priority ?? "all",
    limit: Math.min(Math.max(input?.limit ?? 30, 1), 50)
  };
}

export function createTicketAnalyticsService(input: {
  ticketRepository: TicketAnalyticsRepository;
  analyticsRunner: TicketAnalyticsRunner;
}) {
  return {
    async runTicketAnalytics(filters?: {
      status?: TicketStatusFilter;
      priority?: TicketPriorityFilter;
      limit?: number;
    }) {
      const normalized = normalizeAnalyticsInput(filters);
      const tickets = input.ticketRepository.listTickets(
        normalized.status,
        normalized.priority,
        normalized.limit
      );

      return input.analyticsRunner.run({ tickets });
    }
  };
}
