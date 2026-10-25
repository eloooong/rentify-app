import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAppOrigin } from "@/lib/auth/config";
import { api, ApiError, jsonBody, limitedBody } from "@/lib/catalog/http";
import { bookingError } from "@/lib/bookings/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { xenditProvider } from "./provider";
import { runPaymentWork } from "./work";
import { signedEvent } from "./webhook";
import { checkoutInput, checkoutStatus } from "./validation";
import { workerAuthorized } from "./worker-auth";
import { paymentReturnOrigin } from "./xendit";

function provider() {
  const secret = process.env.XENDIT_SECRET_KEY;
  if (!secret || process.env.RENTIFY_PAYMENTS_ENABLED !== "true")
    throw new ApiError(
      503,
      "payments_unavailable",
      "Test checkout is not configured.",
    );
  return xenditProvider(secret);
}
function paymentError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (
    error.code === "P0001" &&
    ["payment_closed", "payment_amount", "payment_consent"].includes(
      error.message ?? "",
    )
  ) {
    const code = error.message!;
    throw new ApiError(
      code === "payment_closed" ? 409 : 400,
      code,
      code === "payment_closed"
        ? "Checkout is closed for this booking."
        : code === "payment_amount"
          ? "The quote is outside the test payment/refund limits."
          : "Accept the current demo payment rules before checkout.",
    );
  }
  bookingError(error);
}
function decoded(value: unknown) {
  const parsed = checkoutStatus.nullable().safeParse(value);
  if (!parsed.success)
    throw new ApiError(
      503,
      "unavailable",
      "Payment status could not be verified.",
    );
  return parsed.data;
}
export function checkout(request: NextRequest, booking: string) {
  return api(request, async (client) => {
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user?.email_confirmed_at)
      throw new ApiError(401, "sign_in", "Sign in with a verified email.");
    z.uuid().parse(booking);
    if (request.method === "GET") {
      const result = await client.rpc("get_checkout", { p_booking: booking });
      paymentError(result.error);
      return NextResponse.json({ data: decoded(result.data) });
    }
    const input = checkoutInput.parse(await jsonBody(request));
    const gateway = provider();
    const origin = paymentReturnOrigin(getAppOrigin());
    // Configuration is checked before creating consent/attempt state. No privileged client identity is accepted.
    const admin = createAdminClient();
    const prepared = await client.rpc("prepare_checkout", {
      p_booking: booking,
      p_policy: input.policy_version,
    });
    paymentError(prepared.error);
    const initial = decoded(prepared.data)!;
    await runPaymentWork(admin, gateway, origin, initial.id);
    const result = await client.rpc("get_checkout", { p_booking: booking });
    paymentError(result.error);
    const data = decoded(result.data)!;
    return NextResponse.json(
      { data },
      { status: data.state === "creating" ? 202 : 200 },
    );
  });
}
function privateResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function webhook(request: NextRequest) {
  try {
    const secret = process.env.XENDIT_WEBHOOK_TOKEN;
    if (process.env.RENTIFY_PAYMENTS_ENABLED !== "true" || !secret)
      return privateResponse(
        {
          error: {
            code: "payments_unavailable",
            message: "Test webhook is not configured.",
          },
        },
        503,
      );
    if (
      request.headers.get("content-type")?.split(";")[0] !== "application/json"
    )
      return privateResponse(
        { error: { code: "content_type", message: "Send application/json." } },
        415,
      );
    const raw = await limitedBody(request, 262144);
    let event: ReturnType<typeof signedEvent>;
    try {
      event = signedEvent(raw, request.headers.get("x-callback-token"), secret);
    } catch {
      return privateResponse(
        {
          error: {
            code: "invalid_webhook",
            message: "Webhook could not be verified.",
          },
        },
        400,
      );
    }
    const result = await createAdminClient().rpc("enqueue_payment_event", {
      p_event: event.id,
      p_session: event.session,
      p_reference: event.reference,
      p_hash: event.hash,
    });
    if (result.error)
      return privateResponse(
        {
          error: {
            code: "unavailable",
            message: "Webhook could not be recorded.",
          },
        },
        503,
      );
    return privateResponse({ received: true });
  } catch (error) {
    return privateResponse(
      {
        error: {
          code: error instanceof ApiError ? error.code : "unavailable",
          message: "Webhook could not be recorded.",
        },
      },
      error instanceof ApiError ? error.status : 503,
    );
  }
}
export async function reconcile(request: NextRequest) {
  if (!workerAuthorized(request))
    return privateResponse(
      {
        error: {
          code: "forbidden",
          message: "Worker authentication required.",
        },
      },
      403,
    );
  try {
    return privateResponse(
      await runPaymentWork(
        createAdminClient(),
        provider(),
        paymentReturnOrigin(getAppOrigin()),
      ),
    );
  } catch {
    return privateResponse(
      {
        error: {
          code: "unavailable",
          message: "Reconciliation could not run.",
        },
      },
      503,
    );
  }
}
