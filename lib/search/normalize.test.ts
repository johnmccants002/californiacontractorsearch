import { describe, expect, it } from "vitest";
import { normalizeBusinessName, normalizeClassificationCode, normalizePersonName } from "./normalize";

describe("search normalization", () => {
  it.each([
    ["THE ABC PLUMBING, INC.", "abc plumbing"],
    ["ABC Plumbing", "abc plumbing"],
    ["  Golden   State Electric Co. ", "golden state electric"],
  ])("normalizes business name %s", (input, expected) => {
    expect(normalizeBusinessName(input)).toBe(expected);
  });

  it("normalizes classification formats to the same code", () => {
    expect(normalizeClassificationCode("C-36")).toBe("c36");
    expect(normalizeClassificationCode("C36")).toBe("c36");
  });

  it("normalizes initials without losing the initial", () => {
    expect(normalizePersonName("John A. Smith")).toBe("john a smith");
    expect(normalizePersonName("JOHN A SMITH")).toBe("john a smith");
  });
});
