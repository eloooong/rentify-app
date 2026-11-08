import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import {
  captureOrigin,
  runBookingEmailBatch,
} from "../../lib/notifications/email-worker.mjs";
import { runCli } from "./cli.mjs";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--loop"))
  throw new Error("Usage: npm run emails:local [-- --loop]");

// This command only uses the CLI's local status and the built-in Mailpit sink.
// App and hosted environment keys are not inputs to the worker.
const status = JSON.parse(runCli(["status", "--output", "json"], true));
if (status.API_URL !== "http://127.0.0.1:54321" || !status.SERVICE_ROLE_KEY)
  throw new Error("Start the local Rentify Supabase stack first.");
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const controller = new AbortController();
process.on("SIGINT", () => controller.abort());
process.on("SIGTERM", () => controller.abort());
do {
  try {
    const ready = await fetch(captureOrigin + "/api/v1/info", {
      signal: AbortSignal.timeout(3000),
      redirect: "error",
    });
    if (!ready.ok) throw new Error("Mailpit unavailable");
    console.log(JSON.stringify(await runBookingEmailBatch(admin)));
  } catch {
    console.error(
      "Local email worker failed. Check the local migration and Mailpit.",
    );
    if (!args.length) {
      process.exitCode = 1;
      break;
    }
  }
  if (!args.length || controller.signal.aborted) break;
  await delay(60000, undefined, { signal: controller.signal }).catch(
    (error) => {
      if (error.name !== "AbortError") throw error;
    },
  );
} while (!controller.signal.aborted);
