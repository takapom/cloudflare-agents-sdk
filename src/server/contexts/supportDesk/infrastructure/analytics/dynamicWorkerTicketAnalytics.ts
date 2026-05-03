import type { TicketView } from "@/shared/contracts";
import type { TicketAnalyticsRunner } from "@/server/contexts/supportDesk/application/analytics/ticketAnalyticsService";
import type { Env } from "@/server/platform/env";

export function createDynamicWorkerTicketAnalyticsRunner(env: Env): TicketAnalyticsRunner {
  return {
    async run(input: { tickets: TicketView[] }) {
      const worker = env.LOADER.get("supportdesk-ticket-analytics-v1", async () => ({
        compatibilityDate: "2026-05-01",
        mainModule: "src/index.js",
        modules: {
          "src/index.js": `
            function countBy(items, key) {
              return items.reduce((acc, item) => {
                const value = item[key] || "unknown";
                acc[value] = (acc[value] || 0) + 1;
                return acc;
              }, {});
            }

            function score(ticket) {
              const priorityScore = { urgent: 100, high: 70, medium: 40, low: 10 }[ticket.priority] || 0;
              const statusScore = ticket.status === "open" ? 20 : ticket.status === "pending" ? 10 : 0;
              return priorityScore + statusScore;
            }

            export default {
              async fetch(request) {
                const { tickets } = await request.json();

                const ranked = [...tickets]
                  .sort((a, b) => score(b) - score(a))
                  .slice(0, 10)
                  .map((ticket) => ({
                    id: ticket.id,
                    subject: ticket.subject,
                    priority: ticket.priority,
                    status: ticket.status,
                    category: ticket.category,
                    score: score(ticket),
                    tags: ticket.tags
                  }));

                return Response.json({
                  ok: true,
                  sandbox: "dynamic-worker",
                  total: tickets.length,
                  byStatus: countBy(tickets, "status"),
                  byPriority: countBy(tickets, "priority"),
                  byCategory: countBy(tickets, "category"),
                  topTickets: ranked,
                  recommendation: ranked.length > 0
                    ? "Start with " + ranked[0].id + ": " + ranked[0].subject
                    : "No matching tickets"
                });
              }
            };
          `
        },
        globalOutbound: null
      }));

      const entrypoint = worker.getEntrypoint();
      const response = await entrypoint.fetch(
        new Request("https://supportdesk.local/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tickets: input.tickets })
        })
      );

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: await response.text()
        };
      }

      return response.json();
    }
  };
}
