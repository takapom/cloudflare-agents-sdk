export const readonlyToolNames = [
  "listTickets",
  "getTicket",
  "searchTickets",
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
  "write",
  "edit",
  "delete"
]);

export function isMutatingTool(toolName: string) {
  return mutatingToolNames.has(toolName);
}
