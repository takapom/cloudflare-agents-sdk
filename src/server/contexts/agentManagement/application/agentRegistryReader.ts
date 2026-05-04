import type {
  AgentDefinition,
  AgentId,
  AgentLifecycleStatus
} from "@/server/contexts/agentManagement/domain/agentDefinition";

export type AgentDefinitionFilter = {
  context?: string;
  status?: AgentLifecycleStatus;
};

export type AgentRegistryReader = {
  listAgentDefinitions(): readonly AgentDefinition[];
  findAgentDefinition(id: AgentId): AgentDefinition | undefined;
};

export function matchesAgentDefinitionFilter(
  definition: AgentDefinition,
  filter: AgentDefinitionFilter = {}
) {
  if (filter.context && definition.context !== filter.context) {
    return false;
  }

  if (filter.status && definition.status !== filter.status) {
    return false;
  }

  return true;
}
