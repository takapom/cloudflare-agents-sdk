import type {
  AgentDefinition,
  AgentId
} from "@/server/contexts/agentManagement/domain/agentDefinition";
import { listAgents } from "@/server/contexts/agentManagement/application/listAgents";
import { getAgentDefinition } from "@/server/contexts/agentManagement/application/getAgentDefinition";
import type {
  AgentDefinitionFilter,
  AgentRegistryReader
} from "@/server/contexts/agentManagement/application/agentRegistryReader";
import { createStaticAgentRegistry } from "@/server/contexts/agentManagement/infrastructure/staticAgentRegistry";

export type AgentManagementContext = {
  agents: {
    list(filter?: AgentDefinitionFilter): readonly AgentDefinition[];
    get(id: AgentId): AgentDefinition | undefined;
  };
};

export function createAgentManagementContext(options?: {
  registry?: AgentRegistryReader;
}): AgentManagementContext {
  const registry = options?.registry ?? createStaticAgentRegistry();

  return {
    agents: {
      list: (filter) => listAgents(registry, filter),
      get: (id) => getAgentDefinition(registry, id)
    }
  };
}
