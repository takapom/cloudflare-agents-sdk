import { ReplyDraftAgent } from "@/server/agents/replyDraft/replyDraftAgent";
import { SupportDeskAgent } from "@/server/agents/workspace/workspaceAgent";
import worker from "@/server/entrypoints/worker";

export { SupportDeskAgent, ReplyDraftAgent };
export type {
  DeskMode,
  SupportDeskState,
  TenantOverview,
  TicketPriority,
  TicketStatus,
  TicketView
} from "@/shared/contracts";

export default worker;
