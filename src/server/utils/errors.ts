export function isSqliteContention(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("SQLITE_BUSY") ||
    message.includes("database is locked") ||
    message.includes("SQLITE_READONLY") ||
    message.includes("readonly database")
  );
}
