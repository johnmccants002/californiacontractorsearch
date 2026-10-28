export function typesenseEnabled(env: Record<string, string | undefined> = process.env) {
  return env.TYPESENSE_ENABLED === "true";
}

export function typesenseConfig(env: Record<string, string | undefined> = process.env, purpose: "search" | "index" = "search") {
  const host = env.TYPESENSE_HOST?.trim() ?? "";
  const protocol = env.TYPESENSE_PROTOCOL ?? "https";
  const port = Number(env.TYPESENSE_PORT ?? (protocol === "https" ? 443 : 8108));
  const collection = env.TYPESENSE_COLLECTION ?? "contractors";
  const key = purpose === "index" ? env.TYPESENSE_ADMIN_API_KEY : env.TYPESENSE_SEARCH_API_KEY;
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || !["https", "http"].includes(protocol) ||
      (protocol === "http" && !["localhost", "127.0.0.1"].includes(host)) ||
      !Number.isInteger(port) || port < 1 || port > 65535 ||
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(collection) || !key?.trim()) {
    // Never include environment values or SDK errors (which can contain headers).
    throw new Error("Invalid Typesense configuration. Check the documented server environment variables.");
  }
  return { host, protocol, port, collection, key };
}
