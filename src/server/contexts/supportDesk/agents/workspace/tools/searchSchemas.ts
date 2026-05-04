import { z } from "zod";

export const semanticSearchTicketsInputSchema = z.object({
  query: z.string().min(1),
  status: z.enum(["open", "pending", "resolved", "all"]).default("all"),
  priority: z.enum(["low", "medium", "high", "urgent", "all"]).default("all"),
  limit: z.number().int().min(1).max(20).default(8)
});

export const reindexSearchInputSchema = z.object({
  status: z.enum(["open", "pending", "resolved", "all"]).default("all"),
  priority: z.enum(["low", "medium", "high", "urgent", "all"]).default("all"),
  limit: z.number().int().min(1).max(100).default(50)
});
