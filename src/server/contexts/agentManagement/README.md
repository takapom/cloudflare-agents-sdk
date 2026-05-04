# Agent Management Context

`agentManagement` is the bounded context for managing agents as business objects.

It starts as a small static agent catalog. It owns the current registered agent
definitions and read use cases for listing or looking up agents.

It can grow into agent registration, agent configuration, model settings, tool
permissions, approval policy settings, enablement, run history, and usage limits
when those become real product requirements.

It does not own domain-specific agent implementations. For example, the support
desk agents live in `src/server/contexts/supportDesk/agents` because they are
part of the support desk bounded context.

Current layout:

```txt
agentManagement/
  agentManagementContext.ts
  domain/
    agentDefinition.ts
  application/
    agentRegistryReader.ts
    getAgentDefinition.ts
    listAgents.ts
  infrastructure/
    staticAgentRegistry.ts
```

`ports/` and `presentation/` are intentionally omitted for now. Add them when
the catalog needs replaceable persistence, HTTP-specific DTOs, or UI-specific
mapping.
