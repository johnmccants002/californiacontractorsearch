export function HighlightedName({ text, tokens = [] }: { text: string; tokens?: string[] }) {
  const safeTokens = [...new Set(tokens.filter((token) => token && token.length <= 100))].sort((a, b) => b.length - a.length).slice(0, 20);
  if (!safeTokens.length) return <>{text}</>;
  const escaped = safeTokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const matcher = new RegExp(`(${escaped.join("|")})`, "gi");
  // React escapes both text and matched tokens. Never render Typesense HTML.
  return <>{text.split(matcher).map((part, index) => index % 2 ? <mark key={index}>{part}</mark> : part)}</>;
}
