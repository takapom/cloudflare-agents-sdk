import { routeAgentRequest } from "agents";
import type { Env } from "@/server/platform/env";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

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
