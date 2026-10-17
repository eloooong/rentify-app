import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const cli = fileURLToPath(
  new URL("../../node_modules/supabase/dist/supabase.js", import.meta.url),
);

export function runCli(args, capture = false) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    // In particular, never print status JSON: it also contains private keys.
    throw new Error(
      `Supabase ${args[0]} failed. Check Docker and run npm run db:start.`,
    );
  }
  return result.stdout;
}

export function localPublicEnvironment() {
  const status = JSON.parse(runCli(["status", "--output", "json"], true));
  const url = status.API_URL;
  const publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  if (typeof url !== "string" || typeof publishableKey !== "string") {
    throw new Error(
      "Local Supabase did not return the public URL and API key.",
    );
  }
  return {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  };
}
