export type AgentId = `${string}.${string}`;

export type AgentLifecycleStatus = "available" | "disabled" | "experimental";

export type AgentRole = "primary" | "subAgent" | "specialist";

export type AgentToolMode = "readonly" | "mutation";

export type ApprovalRequirement = "none" | "required";

export type AgentToolDefinition = {
  name: string;
  description: string;
  mode: AgentToolMode;
  approval: ApprovalRequirement;
};

export type AgentRuntimeBinding = {
  exportedClassName: string;
  durableObjectClass?: string;
};

export type AgentDefinition = {
  id: AgentId;
  context: string;
  name: string;
  displayName: string;
  description: string;
  role: AgentRole;
  status: AgentLifecycleStatus;
  runtime: AgentRuntimeBinding;
  capabilities: readonly string[];
  tools: readonly AgentToolDefinition[];
};
