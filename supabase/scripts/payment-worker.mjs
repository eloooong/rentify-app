import { setTimeout as delay } from "node:timers/promises";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--loop") || args.length > 1)
  throw new Error("Use no arguments or --loop.");
const secret = process.env.PAYMENTS_WORKER_SECRET;
const configured = process.env.RENTIFY_PAYMENTS_ENABLED === "true";
if (
  !configured ||
  !secret ||
  secret.length < 32 ||
  !process.env.NEXT_PUBLIC_APP_URL
)
  throw new Error(
    "Configure the test payment server and worker secret locally first. No provider call was made.",
  );
const origin = new URL(process.env.NEXT_PUBLIC_APP_URL);
if (
  origin.username ||
  origin.password ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash ||
  (origin.protocol !== "https:" &&
    !(
      origin.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
    ))
)
  throw new Error(
    "Use the canonical HTTPS app origin or local development origin.",
  );
do {
  const paths = ["/api/payments/reconcile"];
  if (process.env.RENTIFY_REFUNDS_ENABLED === "true")
    paths.push("/api/payments/refunds/reconcile");
  for (const path of paths) {
    try {
      const response = await fetch(new URL(path, origin), {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(45_000),
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (!response.ok)
        throw new Error(
          "Payment reconciliation is unavailable; check server configuration.",
        );
      const result = await response.json();
      if (
        !Number.isInteger(result.claimed) ||
        !Number.isInteger(result.completed)
      )
        throw new Error("Unexpected reconciliation response.");
      console.log(
        `${path.includes("/refunds/") ? "Refund" : "Payment"} work: ${result.claimed} claimed, ${result.completed} completed.`,
      );
    } catch {
      console.error(
        "Payment reconciliation did not complete. Durable work remains queued; no credentials or provider response were logged.",
      );
      if (!args.includes("--loop")) process.exitCode = 1;
    }
  }
  if (!args.includes("--loop")) break;
  await delay(5_000);
} while (true);
