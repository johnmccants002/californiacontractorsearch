import { describe, expect, it } from "vitest";
import { safeTypesenseError } from "./errors";

describe("credential-safe diagnostics", () => {
  it.each(["out of memory", "OUT_OF_MEMORY"])("reports %s without including the server payload or headers", (message) => {
    const result = safeTypesenseError({ httpStatus: 422, message: `${message}; secret-key`, httpBody: "private request", config: { headers: { key: "secret-key" } } });
    expect(result).toContain("memory capacity");
    expect(result).toContain("HTTP 422");
    expect(result).not.toContain("secret-key");
  });
  it("does not echo arbitrary error values", () => {
    expect(safeTypesenseError({ httpStatus: "secret-key", httpBody: "secret-key", message: "secret-key" })).not.toContain("secret-key");
  });
});
