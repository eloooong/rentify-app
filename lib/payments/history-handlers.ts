import { NextRequest, NextResponse } from "next/server";
import { api, ApiError } from "@/lib/catalog/http";
import { bookingError } from "@/lib/bookings/errors";
import { historyQuery, historySchema } from "./history-validation";

export function paymentHistory(request: NextRequest) {
  return api(request, async (client) => {
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user?.email_confirmed_at)
      throw new ApiError(401, "sign_in", "Sign in with a verified email.");
    const params = request.nextUrl.searchParams;
    if (new Set(params.keys()).size !== Array.from(params).length)
      throw new ApiError(400, "validation", "Send each filter once.");
    const input = historyQuery.parse(Object.fromEntries(params));
    const result = await client.rpc("list_payment_history", {
      ...(input.type ? { p_type: input.type } : {}),
      p_role: input.role,
      ...(input.from ? { p_from: input.from } : {}),
      ...(input.to ? { p_to: input.to } : {}),
      p_page: input.page,
      p_page_size: input.pageSize,
    });
    bookingError(result.error);
    const parsed = historySchema.safeParse(result.data);
    if (!parsed.success)
      throw new ApiError(
        503,
        "unavailable",
        "Transaction history could not be verified.",
      );
    return NextResponse.json(parsed.data);
  });
}
