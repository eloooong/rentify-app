import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { api, ApiError, jsonBody } from "@/lib/catalog/http";
import { bookingError } from "@/lib/bookings/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  paidCancellationInput,
  paidCancellationStatus,
  refundStatus,
} from "./refund-validation";
import { workerAuthorized } from "./worker-auth";
import { paymongoRefundProvider } from "./refund-provider";
import { runRefundWork } from "./refund-work";

export function bookingRefunds(request: NextRequest, booking: string) {
  return api(request, async (client) => {
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user?.email_confirmed_at)
      throw new ApiError(401, "sign_in", "Sign in with a verified email.");
    z.uuid().parse(booking);
    const cancelling = request.method === "POST";
    const result = cancelling
      ? await client.rpc("cancel_paid_booking", {
          p_booking: booking,
          p_reason: paidCancellationInput.parse(await jsonBody(request)).reason,
        })
      : await client.rpc("get_booking_refunds", { p_booking: booking });
    if (
      result.error?.code === "P0001" &&
      result.error.message === "paid_cancellation_closed"
    )
      throw new ApiError(
        409,
        "paid_cancellation_closed",
        "Paid cancellation is unavailable. It requires an eligible paid booking before pickup day; later issues need manual review.",
      );
    bookingError(result.error);
    const schema = cancelling ? paidCancellationStatus : refundStatus;
    const parsed = schema.safeParse(result.data);
    if (!parsed.success)
      throw new ApiError(
        503,
        "unavailable",
        "Refund status could not be verified.",
      );
    return NextResponse.json({ data: parsed.data });
  });
}
export async function reconcileRefunds(request: NextRequest) {
  const respond = (body: unknown, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  if (!workerAuthorized(request))
    return respond(
      {
        error: {
          code: "forbidden",
          message: "Worker authentication required.",
        },
      },
      403,
    );
  if (
    process.env.RENTIFY_PAYMENTS_ENABLED !== "true" ||
    process.env.RENTIFY_REFUNDS_ENABLED !== "true" ||
    !process.env.PAYMONGO_SECRET_KEY
  )
    return respond(
      {
        error: {
          code: "refunds_unavailable",
          message: "Test refunds are not configured.",
        },
      },
      503,
    );
  try {
    return respond(
      await runRefundWork(
        createAdminClient(),
        paymongoRefundProvider(process.env.PAYMONGO_SECRET_KEY),
      ),
    );
  } catch {
    return respond(
      {
        error: {
          code: "unavailable",
          message: "Refund reconciliation could not run.",
        },
      },
      503,
    );
  }
}
