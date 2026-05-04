import type { AgentDefinition } from "@/server/contexts/agentManagement/domain/agentDefinition";
import {
  matchesAgentDefinitionFilter,
  type AgentDefinitionFilter,
  type AgentRegistryReader
} from "@/server/contexts/agentManagement/application/agentRegistryReader";

export function listAgents(
  registry: AgentRegistryReader,
  filter: AgentDefinitionFilter = {}
): readonly AgentDefinition[] {
  return registry
    .listAgentDefinitions()
    .filter((definition) => matchesAgentDefinitionFilter(definition, filter));
}
