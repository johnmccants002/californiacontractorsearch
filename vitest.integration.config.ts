import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["**/*.integration.ts"],
    env: loadEnv("test", process.cwd(), "NEXT_PUBLIC_SUPABASE_"),
    testTimeout: 20_000,
    hookTimeout: 20_000,
    fileParallelism: false,
  },
});
