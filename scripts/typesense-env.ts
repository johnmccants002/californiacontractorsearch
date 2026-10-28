import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

// @next/env is CommonJS; use the same entry point from both tsx ESM scripts
// and its CommonJS evaluation mode.
const { loadEnvConfig } = createRequire(`${process.cwd()}/package.json`)("@next/env") as typeof import("@next/env");

export async function loadTypesenseEnvironment(args: string[]) {
  loadEnvConfig(process.cwd());
  const position = args.indexOf("--credentials-file");
  if (position >= 0) {
    const path = args[position + 1];
    if (!path) throw new Error("A credentials file path is required.");
    const text = await readFile(path, "utf8");
    const host = text.match(/[a-z0-9.-]+\.typesense\.net/)?.[0];
    const admin = text.match(/Admin API Key\s*[:=]\s*(\S+)/i)?.[1];
    const search = text.match(/Search Only API Key\s*[:=]\s*(\S+)/i)?.[1];
    if (!host || !admin || !search) throw new Error("Unrecognized Typesense Cloud credential export. Use server environment variables instead.");
    // Values stay in this process; never write the user's export into the repo.
    process.env.TYPESENSE_HOST = host;
    process.env.TYPESENSE_PROTOCOL = "https";
    process.env.TYPESENSE_PORT = "443";
    process.env.TYPESENSE_ADMIN_API_KEY = admin;
    process.env.TYPESENSE_SEARCH_API_KEY = search;
  }
}
