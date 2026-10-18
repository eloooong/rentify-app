import { ApiError } from "@/lib/catalog/http";

const errors: Record<string, [number, string]> = {
  profile_required: [
    403,
    "Complete your profile; a verified active account is required.",
  ],
  forbidden: [403, "This account cannot perform that action."],
  not_found: [404, "Booking or listing not found."],
  invalid_dates: [
    400,
    "Choose 1–30 rental days, with 24 hours' notice before the pickup date begins and pickup within 90 days.",
  ],
  invalid_query: [400, "Check the query and date window."],
  invalid_action: [
    400,
    "Choose a supported action and provide a valid reason when required.",
  ],
  self_booking: [400, "You cannot book your own listing."],
  unsupported_currency: [400, "The booking demo supports PHP listings."],
  price_limit: [400, "The quoted rental amount exceeds the supported limit."],
  duplicate_request: [
    409,
    "You already have an overlapping open request or reservation for this listing.",
  ],
  idempotency_conflict: [
    409,
    "This request key or completed action was already used with different details.",
  ],
  booking_conflict: [
    409,
    "These dates are already reserved. Choose another period.",
  ],
  booking_expired: [
    409,
    "The booking deadline has passed. Create a new request.",
  ],
  invalid_transition: [
    409,
    "That action is not available for this booking status.",
  ],
  unavailable_listing: [
    409,
    "This listing or participant cannot accept a reservation right now.",
  ],
  device_unavailable: [
    409,
    "This device is currently unavailable for reservations.",
  ],
  legacy_booking: [
    409,
    "This older booking needs a backend review before it can be changed.",
  ],
};

export function bookingError(
  error: { code?: string; message?: string } | null,
) {
  if (!error) return;
  if (error.code === "P0001" && error.message && errors[error.message]) {
    const [status, message] = errors[error.message];
    throw new ApiError(status, error.message, message);
  }
  if (error.code === "42501") {
    const code =
      error.message === "profile_required" ? "profile_required" : "forbidden";
    throw new ApiError(403, code, errors[code][1]);
  }
  if (error.code === "23P01")
    throw new ApiError(409, "booking_conflict", errors.booking_conflict[1]);
  if (error.code === "23505")
    throw new ApiError(
      409,
      "idempotency_conflict",
      errors.idempotency_conflict[1],
    );
  if (error.code === "23503")
    throw new ApiError(
      409,
      "dependencies",
      "This booking's related records have changed. Refresh and try again.",
    );
  if (error.code?.startsWith("22") || error.code === "23514")
    throw new ApiError(400, "validation", "Check the booking details.");
  if (["40P01", "40001", "55P03", "57014"].includes(error.code ?? ""))
    throw new ApiError(
      409,
      "retry",
      "Please retry this request or action with the same details.",
    );
  throw new ApiError(
    503,
    "unavailable",
    "The booking service is temporarily unavailable.",
  );
}
