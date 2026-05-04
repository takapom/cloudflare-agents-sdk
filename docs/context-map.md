# Context Map

This project is organized around bounded contexts first. Agents are AI
interfaces inside the context that owns the business language they operate on.

```txt
supportDesk
  -> knowledgeBase
  -> agentManagement
  -> capabilities/weather
  -> platform/cloudflare bindings

knowledgeBase
  -> agentManagement
  -> platform

agentManagement
  -> platform
```

## Contexts

### `supportDesk`

Owns support ticket operations: ticket search, summaries, priority handling,
reply drafting, internal notes, status changes, analytics, and semantic search.

Support-specific agents live under `src/server/contexts/supportDesk/agents`.
Those agents may depend on Cloudflare Agents SDK, but support desk business
rules should stay in `application` and `domain`.

### `agentManagement`

Owns management of agents as configurable business objects: registration,
enablement, tool permissions, approval policy settings, model settings, run
history, and usage limits.

This context does not contain every agent implementation. Domain-specific agents
stay with their owning bounded context.

The current implementation is intentionally small: a static agent catalog plus
read use cases. Persistence ports and presentation DTOs should be added only
after agent configuration or management APIs become real requirements.

### `knowledgeBase`

Owns internal knowledge articles, FAQ candidates, article freshness review,
duplicate detection, and support-ticket-derived knowledge suggestions.

Knowledge-specific agents live under
`src/server/contexts/knowledgeBase/agents`. The current
`KnowledgeCuratorAgent` is a specialist agent for knowledge maintenance, not
customer support conversation handling.

## Capabilities

### `weather`

Provides a business-independent external capability. It can be exposed to an
agent as a tool, but it does not depend on any agent or support desk module.
