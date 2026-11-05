import { existsSync } from "node:fs";
import nextEnv from "@next/env";
import { flushClaimNotices } from "../lib/claims/notices";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] !== "--run")
    throw new Error(
      "Explicit --run is required; sends at most three never-attempted claim emails.",
    );
  if (existsSync(".env.refresh.local"))
    process.loadEnvFile(".env.refresh.local");
  nextEnv.loadEnvConfig(process.cwd());
  const result = await flushClaimNotices();
  console.log(JSON.stringify(result));
}
main().catch(() => {
  console.error(
    "Claim email delivery stopped. Inspect configuration and private queue state; raw errors and recipient details suppressed.",
  );
  process.exitCode = 1;
});
