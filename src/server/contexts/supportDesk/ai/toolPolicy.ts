export const readonlyToolNames = [
  "listTickets",
  "getTicket",
  "searchTickets",
  "semanticSearchTickets",
  "getWeather",
  "codemode",
  "runDynamicWorkerTicketAnalytics",
  "read",
  "list",
  "find",
  "grep"
];

const mutatingToolNames = new Set([
  "draftReplyWithSubAgent",
  "addInternalNote",
  "changeTicketStatus",
  "seedDemoData",
  "reindexSearch",
  "write",
  "edit",
  "delete"
]);

export function isMutatingTool(toolName: string) {
  return mutatingToolNames.has(toolName);
}
