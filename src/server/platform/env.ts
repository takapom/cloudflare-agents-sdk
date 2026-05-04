import type { SupportDeskAgent } from "@/server/contexts/supportDesk/agents/workspace/workspaceAgent";

export type Env = {
  AI: Ai;
  SUPPORT_DESK_VECTORIZE: Vectorize;
  LOADER: any;
  SupportDeskAgent: DurableObjectNamespace<SupportDeskAgent>;
};
