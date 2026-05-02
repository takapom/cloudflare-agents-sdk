import type { SupportDeskAgent } from "@/server/agents/supportDeskAgent";

export type Env = {
  AI: Ai;
  SUPPORT_DESK_VECTORIZE: Vectorize;
  LOADER: any;
  SupportDeskAgent: DurableObjectNamespace<SupportDeskAgent>;
};
