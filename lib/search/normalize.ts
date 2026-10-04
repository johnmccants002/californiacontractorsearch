const BUSINESS_SUFFIXES = new Set([
  "llc",
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "company",
  "co",
]);

export function normalizeClassificationCode(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/([a-z])\s*-\s*(\d)/g, "$1$2")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeBusinessName(value: string): string {
  const words = normalizeText(value).split(" ").filter(Boolean);

  if (words[0] === "the") words.shift();
  while (words.length > 1 && BUSINESS_SUFFIXES.has(words.at(-1) ?? "")) {
    words.pop();
  }

  return words.join(" ");
}

export function normalizePersonName(value: string): string {
  return normalizeText(value);
}

export function displayClassificationCode(code: string): string {
  const normalized = normalizeClassificationCode(code).toUpperCase();
  const match = normalized.match(/^([A-Z]+)(\d+)$/);
  return match ? `${match[1]}-${match[2]}` : normalized;
}
