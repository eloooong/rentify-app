import { createHash, timingSafeEqual } from "node:crypto";

export function workerAuthorized(request: Request) {
  const secret = process.env.PAYMENTS_WORKER_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  return (
    !!secret &&
    secret.length >= 32 &&
    auth.length <= 1024 &&
    timingSafeEqual(
      createHash("sha256").update(auth).digest(),
      createHash("sha256").update(`Bearer ${secret}`).digest(),
    )
  );
}
