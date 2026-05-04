import type {
  AgentDefinition,
  AgentId
} from "@/server/contexts/agentManagement/domain/agentDefinition";
import type { AgentRegistryReader } from "@/server/contexts/agentManagement/application/agentRegistryReader";

export function getAgentDefinition(
  registry: AgentRegistryReader,
  id: AgentId
): AgentDefinition | undefined {
  return registry.findAgentDefinition(id);
}
