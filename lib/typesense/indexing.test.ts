import { describe, expect, it, vi } from "vitest";
import { assertCompleteIndex, assertImportSuccess, incrementalRemovals, parseIds, readIndexSource } from "./indexing";
import { typesenseConfig, typesenseEnabled } from "./config";
describe("safe index publication and sync", () => {
  it("retries transient source checks without advancing checkpoints", async () => {
    const read = vi.fn().mockResolvedValueOnce({ error: { code: "57014" }, status: 500 }).mockRejectedValueOnce(new Error("private request"))
      .mockResolvedValue({ error: null, status: 200, data: [1] });
    const sleep = vi.fn().mockResolvedValue(undefined);
    expect(await readIndexSource(read, "licenses count", sleep)).toMatchObject({ data: [1] });
    expect(read).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[1000], [2000]]);
  });
  it("bounds retries and suppresses source error payloads", async () => {
    const read = vi.fn().mockResolvedValue({ error: { code: "57014", message: "secret" }, status: 500 });
    await expect(readIndexSource(read, "licenses count", async () => {})).rejects.toThrow("licenses count failed (HTTP 500, code 57014)");
    expect(read).toHaveBeenCalledTimes(3);
    const denied = vi.fn().mockResolvedValue({ error: { code: "42501", message: "secret" }, status: 403 });
    await expect(readIndexSource(denied, "licenses count", async () => {})).rejects.toThrow("code 42501");
    expect(denied).toHaveBeenCalledTimes(1);
  });
  it("requires every document acknowledgement, even on HTTP 200", () => {
    expect(() => assertImportSuccess([{ success: true }, { success: false, code: 400, error: "private payload" }], 2)).toThrow("1 rejected");
    expect(() => assertImportSuccess([{ success: true }], 2)).toThrow("acknowledgements");
    expect(() => assertImportSuccess([{ success: true }], 1)).not.toThrow();
  });
  it("does not publish partial, empty, or changed-source indexes", () => {
    expect(() => assertCompleteIndex(1, 2, 1, "same", "same")).toThrow("count");
    expect(() => assertCompleteIndex(2, 2, 2, "old", "new")).toThrow("Source data changed");
    expect(() => assertCompleteIndex(0, 0, 0, "same", "same")).toThrow("count");
    expect(() => assertCompleteIndex(2, 2, 2, "same", "same")).not.toThrow();
  });
  it("bounds incremental sync to explicitly named unique IDs", () => {
    expect(parseIds("1,2,1")).toEqual([1, 2]);
    expect(() => parseIds("1 || true")).toThrow();
    expect(() => parseIds("-2")).toThrow();
  });
  it("reconciles deletions and no-longer-public records without removing unrelated documents", () => {
    expect(incrementalRemovals([1, 2, 3], [{ license_id: 2 }])).toEqual([1, 3]);
    expect(incrementalRemovals([2], [{ license_id: 2 }])).toEqual([]);
    expect(() => incrementalRemovals([2], [{ license_id: 99 }])).toThrow("unrequested");
  });
  it("defaults off and never substitutes an admin key for a search key", () => {
    const env = { TYPESENSE_HOST: "example.typesense.net", TYPESENSE_ADMIN_API_KEY: "admin" };
    expect(typesenseEnabled(env)).toBe(false);
    expect(() => typesenseConfig(env)).toThrow("configuration");
    expect(typesenseConfig(env, "index").key).toBe("admin");
    expect(() => typesenseConfig({ ...env, TYPESENSE_PROTOCOL: "http" }, "index")).toThrow();
  });
});
