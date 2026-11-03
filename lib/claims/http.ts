import { claimsEnabled, claimsOrigin } from "./config";
import { ClaimInputError } from "./validation";
export const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};
export function claimResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: privateHeaders });
}
export async function claimBody(
  request: Request,
): Promise<Record<string, unknown>> {
  if (!claimsEnabled())
    throw new ClaimInputError("Profile claiming is not available yet.");
  if (request.headers.get("origin") !== claimsOrigin())
    throw new ClaimInputError("Reload this page before submitting.");
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new ClaimInputError("Invalid request format.");
  const reader = request.body?.getReader();
  if (!reader) throw new ClaimInputError("Empty request.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) {
        await reader.cancel();
        throw new ClaimInputError("Request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    return data;
  } catch {
    throw new ClaimInputError("Invalid request format.");
  }
}
export function claimError(error: unknown) {
  return claimResponse(
    {
      error:
        error instanceof ClaimInputError
          ? error.message
          : "Unable to save this request. Please try again or contact support.",
    },
    error instanceof ClaimInputError ? 400 : 503,
  );
}
