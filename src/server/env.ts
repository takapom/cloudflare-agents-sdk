import type { SupportDeskAgent } from "@/server/agents/supportDeskAgent";

export type Env = {
  AI: Ai;
  LOADER: any;
  SupportDeskAgent: DurableObjectNamespace<SupportDeskAgent>;
};
