import type { AgentRegistryReader } from "@/server/contexts/agentManagement/application/agentRegistryReader";
import type {
  AgentDefinition,
  AgentId
} from "@/server/contexts/agentManagement/domain/agentDefinition";

const staticAgentDefinitions = [
  {
    id: "supportDesk.workspace",
    context: "supportDesk",
    name: "workspace",
    displayName: "Support Desk Workspace Agent",
    description:
      "Main support desk agent for ticket search, summaries, priority handling, reply drafting, notes, status changes, analytics, and semantic search.",
    role: "primary",
    status: "available",
    runtime: {
      exportedClassName: "SupportDeskAgent",
      durableObjectClass: "SupportDeskAgent"
    },
    capabilities: [
      "supportDesk.ticket.read",
      "supportDesk.ticket.mutate",
      "supportDesk.semanticSearch",
      "supportDesk.analytics",
      "capabilities.weather"
    ],
    tools: [
      {
        name: "listTickets",
        description: "List support tickets with status and priority filters.",
        mode: "readonly",
        approval: "none"
      },
      {
        name: "getTicket",
        description: "Read a single support ticket.",
        mode: "readonly",
        approval: "none"
      },
      {
        name: "semanticSearchTickets",
        description: "Search support tickets by semantic similarity.",
        mode: "readonly",
        approval: "none"
      },
      {
        name: "draftReplyWithSubAgent",
        description: "Delegate customer-facing reply drafting to ReplyDraftAgent.",
        mode: "mutation",
        approval: "required"
      },
      {
        name: "addInternalNote",
        description: "Add an internal note to a support ticket.",
        mode: "mutation",
        approval: "required"
      },
      {
        name: "changeTicketStatus",
        description: "Change a support ticket status.",
        mode: "mutation",
        approval: "required"
      },
      {
        name: "reindexSearch",
        description: "Rebuild semantic search index entries.",
        mode: "mutation",
        approval: "required"
      }
    ]
  },
  {
    id: "supportDesk.replyDraft",
    context: "supportDesk",
    name: "replyDraft",
    displayName: "Reply Draft Agent",
    description:
      "Specialist sub-agent for generating customer-facing support reply drafts.",
    role: "subAgent",
    status: "available",
    runtime: {
      exportedClassName: "ReplyDraftAgent"
    },
    capabilities: ["supportDesk.replyDraft"],
    tools: []
  },
  {
    id: "knowledgeBase.knowledgeCurator",
    context: "knowledgeBase",
    name: "knowledgeCurator",
    displayName: "Knowledge Curator Agent",
    description:
      "Specialist agent for FAQ suggestions, duplicate detection, article freshness review, and knowledge article draft proposals.",
    role: "specialist",
    status: "experimental",
    runtime: {
      exportedClassName: "KnowledgeCuratorAgent"
    },
    capabilities: [
      "knowledgeBase.article.read",
      "knowledgeBase.article.review",
      "knowledgeBase.article.propose"
    ],
    tools: [
      {
        name: "listKnowledgeArticles",
        description: "List knowledge base article summaries.",
        mode: "readonly",
        approval: "none"
      },
      {
        name: "getKnowledgeArticle",
        description: "Read a single knowledge base article.",
        mode: "readonly",
        approval: "none"
      },
      {
        name: "suggestFaqFromTickets",
        description: "Suggest an FAQ candidate from support ticket summaries.",
        mode: "readonly",
        approval: "none"
      },
      {
        name: "detectDuplicateArticles",
        description: "Find article overlap before creating a knowledge entry.",
        mode: "readonly",
        approval: "none"
      },
      {
        name: "reviewArticleFreshness",
        description: "Review stale or draft knowledge articles.",
        mode: "readonly",
        approval: "none"
      },
      {
        name: "proposeArticleDraft",
        description: "Propose a new or updated knowledge article draft.",
        mode: "mutation",
        approval: "required"
      }
    ]
  }
] as const satisfies readonly AgentDefinition[];

export function createStaticAgentRegistry(): AgentRegistryReader {
  return {
    listAgentDefinitions() {
      return staticAgentDefinitions;
    },
    findAgentDefinition(id: AgentId) {
      return staticAgentDefinitions.find((definition) => definition.id === id);
    }
  };
}
