import { routeAgentRequest } from "agents";
import { ReplyDraftAgent } from "@/server/agents/replyDraft/replyDraftAgent";
import { SupportDeskAgent } from "@/server/agents/workspace/workspaceAgent";
import type { Env } from "@/server/env";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

export { SupportDeskAgent, ReplyDraftAgent };
export type {
  DeskMode,
  SupportDeskState,
  TenantOverview,
  TicketPriority,
  TicketStatus,
  TicketView
} from "@/shared/contracts";

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, name: "support-desk-pilot" });
    }

    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
