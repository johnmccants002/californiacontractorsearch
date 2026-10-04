import { describe, expect, it } from "vitest";
import { parseQuery } from "./parse-query";

describe("query detection", () => {
  it.each([
    ["1056730", "license", "1056730"],
    ["C-36", "classification", "c36"],
    ["95826", "zip", "95826"],
    ["ABC Plumbing", "text", "abcplumbing"],
    ["John Smith Sacramento", "text", "johnsmithsacramento"],
  ] as const)("detects %s as %s", (input, kind, compact) => {
    const parsed = parseQuery(input);
    expect(parsed.kind).toBe(kind);
    expect(parsed.compact).toBe(compact);
  });
});
