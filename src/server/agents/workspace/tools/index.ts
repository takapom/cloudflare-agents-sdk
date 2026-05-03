import type { ToolSet } from "ai";
import type { Env } from "@/server/platform/env";
import {
  createAnalyticsTools,
  type AnalyticsToolHandlers
} from "@/server/agents/workspace/tools/analyticsTools";
import { createCodemodeTool } from "@/server/agents/workspace/tools/codeModeTool";
import {
  createDraftTools,
  type DraftToolHandlers
} from "@/server/agents/workspace/tools/draftTools";
import {
  createSemanticSearchTools,
  type SemanticSearchToolHandlers
} from "@/server/agents/workspace/tools/searchTools";
import {
  createReadOnlyTicketTools,
  createTicketMutationTools,
  type TicketToolHandlers
} from "@/server/agents/workspace/tools/ticketTools";
import {
  createWeatherTools,
  type WeatherToolHandlers
} from "@/server/agents/workspace/tools/weatherTools";

export type WorkspaceToolHandlers = TicketToolHandlers &
  SemanticSearchToolHandlers &
  AnalyticsToolHandlers &
  DraftToolHandlers &
  WeatherToolHandlers;

export function createWorkspaceTools(
  env: Env,
  handlers: WorkspaceToolHandlers
): ToolSet {
  const readOnlyTools = {
    ...createReadOnlyTicketTools(handlers),
    ...createSemanticSearchTools(handlers),
    ...createWeatherTools(handlers)
  };

  return {
    ...readOnlyTools,
    codemode: createCodemodeTool(env, readOnlyTools),
    ...createAnalyticsTools(handlers),
    ...createDraftTools(handlers),
    ...createTicketMutationTools(handlers)
  };
}
