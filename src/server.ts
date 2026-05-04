import { ReplyDraftAgent } from "@/server/contexts/supportDesk/agents/replyDraft/replyDraftAgent";
import { SupportDeskAgent } from "@/server/contexts/supportDesk/agents/workspace/workspaceAgent";
import { KnowledgeCuratorAgent } from "@/server/contexts/knowledgeBase/agents/knowledgeCurator/knowledgeCuratorAgent";
import worker from "@/server/entrypoints/worker";

export { SupportDeskAgent, ReplyDraftAgent, KnowledgeCuratorAgent };
export type {
  DeskMode,
  SupportDeskState,
  TenantOverview,
  TicketPriority,
  TicketStatus,
  TicketView
} from "@/shared/contracts";

export default worker;
