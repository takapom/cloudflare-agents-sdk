import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { DraftTone } from "@/shared/contracts";

export type DraftToolHandlers = {
  draftReplyWithSubAgent: (ticketId: string, tone: DraftTone) => Promise<unknown>;
};

export function createDraftTools(handlers: DraftToolHandlers): ToolSet {
  return {
    draftReplyWithSubAgent: tool({
      description:
        "Ask ReplyDraftAgent sub-agent to create a customer-facing reply draft for one ticket. This saves a local draft.",
      inputSchema: z.object({
        ticketId: z.string(),
        tone: z.enum(["friendly", "formal", "apologetic", "concise"]).default("friendly")
      }),
      needsApproval: async () => true,
      execute: async ({ ticketId, tone }) => {
        return handlers.draftReplyWithSubAgent(ticketId, tone);
      }
    })
  };
}
