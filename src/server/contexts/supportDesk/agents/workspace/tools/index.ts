import type { ToolSet } from "ai";
import type { Env } from "@/server/platform/env";
import {
  createAnalyticsTools,
  type AnalyticsToolHandlers
} from "@/server/contexts/supportDesk/agents/workspace/tools/analyticsTools";
import { createCodemodeTool } from "@/server/contexts/supportDesk/agents/workspace/tools/codeModeTool";
import {
  createDraftTools,
  type DraftToolHandlers
} from "@/server/contexts/supportDesk/agents/workspace/tools/draftTools";
import {
  createSemanticSearchTools,
  type SemanticSearchToolHandlers
} from "@/server/contexts/supportDesk/agents/workspace/tools/searchTools";
import {
  createReadOnlyTicketTools,
  createTicketMutationTools,
  type TicketToolHandlers
} from "@/server/contexts/supportDesk/agents/workspace/tools/ticketTools";
import {
  createWeatherTools,
  type WeatherToolHandlers
} from "@/server/contexts/supportDesk/agents/workspace/tools/weatherTools";

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
