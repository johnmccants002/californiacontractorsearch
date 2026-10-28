import type { ImportResponse } from "typesense/lib/Typesense/Documents";

/** Read-only validation retries; never log SDK errors or request credentials. */
export async function readIndexSource<T extends { error: { code?: string } | null; status: number }>(
  read: () => PromiseLike<T>, label: string,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  let diagnostic = "network";
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: T | undefined;
    try { response = await read(); } catch { /* Transport details may contain secrets. */ }
    if (response && !response.error) return response;
    if (response) {
      const code = /^[A-Z0-9]{1,12}$/.test(response.error?.code ?? "") ? response.error!.code : "unknown";
      diagnostic = `HTTP ${response.status}, code ${code}`;
      if (response.status > 0 && response.status !== 408 && response.status !== 429 && response.status < 500 && code !== "57014") break;
    }
    if (attempt < 2) await sleep(1000 * 2 ** attempt);
  }
  throw new Error(`Supabase ${label} failed (${diagnostic}); checkpoint retained.`);
}

export function assertImportSuccess(results: ImportResponse[], expected: number) {
  if (results.length !== expected || results.some((result) => !result.success)) {
    const failed = results.filter((result) => !result.success).length;
    // Errors may include entire input documents. Report counts, not payloads.
    throw new Error(`Typesense batch failed: ${failed} rejected, ${results.length}/${expected} acknowledgements. Resume after resolving the schema/data problem.`);
  }
}

export function assertCompleteIndex(imported: number, expected: number, actual: number, before: string, after: string) {
  if (imported < 1 || imported !== expected || imported !== actual) throw new Error("Index count validation failed; alias was not changed.");
  if (before !== after) throw new Error("Source data changed during indexing. Start a new full index after the CSLB import finishes; alias was not changed.");
}

export function parseIds(value: string) {
  const parts = value.split(",");
  if (!parts.length || parts.length > 500 || parts.some((part) => !/^[1-9]\d*$/.test(part) || !Number.isSafeInteger(Number(part)))) throw new Error("Supply 1–500 positive database IDs.");
  return [...new Set(parts.map(Number))];
}

export function incrementalRemovals(requested: number[], documents: { license_id: number }[]) {
  const allowed = new Set(requested);
  if (documents.some((doc) => !allowed.has(doc.license_id))) throw new Error("Incremental batch contains an unrequested ID.");
  const present = new Set(documents.map((doc) => doc.license_id));
  return requested.filter((id) => !present.has(id));
}
