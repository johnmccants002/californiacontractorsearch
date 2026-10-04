import { normalizeClassificationCode, normalizeText } from "./normalize";

export type QueryKind = "empty" | "license" | "classification" | "zip" | "text";

export interface ParsedQuery {
  original: string;
  normalized: string;
  compact: string;
  kind: QueryKind;
  tokens: string[];
}

const CLASSIFICATION_PATTERN = /^[a-z]\s*-?\s*\d{1,2}$/i;
const LETTER_CLASSIFICATION_PATTERN = /^[ab]$/i;

export function parseQuery(input: string): ParsedQuery {
  const original = input.trim();
  const normalized = normalizeText(original);
  const compact = normalized.replace(/\s/g, "");

  let kind: QueryKind = "text";
  if (!normalized) kind = "empty";
  else if (/^\d{5}$/.test(compact)) kind = "zip";
  else if (CLASSIFICATION_PATTERN.test(original) || LETTER_CLASSIFICATION_PATTERN.test(original)) {
    kind = "classification";
  } else {
    const digits = compact.replace(/\D/g, "");
    if (digits.length >= 6 && digits.length / compact.length >= 0.7) kind = "license";
  }

  return {
    original,
    normalized,
    compact:
      kind === "classification" ? normalizeClassificationCode(original) : compact,
    kind,
    tokens: normalized.split(" ").filter(Boolean),
  };
}
