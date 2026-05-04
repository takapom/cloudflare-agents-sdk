import { z } from "zod";

export const ticketStatusSchema = z.enum(["open", "pending", "resolved"]);
export const ticketPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

export const structuredTenantReportSchema = z.object({
  tenantId: z.string(),
  generatedAt: z.string(),
  summary: z.string(),
  metrics: z.object({
    totalTickets: z.number(),
    openOrPendingTickets: z.number(),
    urgentTickets: z.number(),
    notes: z.number(),
    drafts: z.number(),
    auditLogEntries: z.number()
  }),
  statusBreakdown: z.object({
    open: z.number(),
    pending: z.number(),
    resolved: z.number()
  }),
  priorityBreakdown: z.object({
    low: z.number(),
    medium: z.number(),
    high: z.number(),
    urgent: z.number()
  }),
  categoryBreakdown: z.record(z.string(), z.number()),
  topRisks: z.array(
    z.object({
      ticketId: z.string(),
      reason: z.string(),
      severity: ticketPrioritySchema
    })
  ),
  nextActions: z.array(
    z.object({
      label: z.string(),
      ticketId: z.string().nullable(),
      priority: ticketPrioritySchema
    })
  ),
  confidence: z.enum(["low", "medium", "high"])
});
