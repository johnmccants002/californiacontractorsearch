/** SDK exceptions may contain API keys in request headers. Never log them. */
export function safeTypesenseError(error: unknown): string {
  if (!error || typeof error !== "object") return "Typesense request failed.";
  const detail = error as { httpStatus?: unknown; message?: unknown; code?: unknown };
  const status = typeof detail.httpStatus === "number" && detail.httpStatus >= 100 && detail.httpStatus <= 599
    ? ` (HTTP ${detail.httpStatus})` : "";
  // The JS SDK's httpBody is the request payload, not the server response.
  // Classify the message but return only our fixed text, never its contents.
  const body = typeof detail.message === "string" ? detail.message : "";
  if (/out[ _]of[ _]memory|memory usage|memory limit/i.test(body)) return `Typesense rejected the import because of memory capacity${status}. The checkpoint is preserved; review cluster sizing before resuming.`;
  if (/out[ _]of[ _]disk|disk usage|disk limit/i.test(body)) return `Typesense rejected the import because of disk capacity${status}. The checkpoint is preserved.`;
  if (detail.code === "ECONNABORTED" || detail.code === "ETIMEDOUT") return "Typesense request timed out. The last acknowledged checkpoint is preserved.";
  return `Typesense request failed${status}. Check connectivity, capacity, key scope, and server version. Raw error details are suppressed.`;
}
