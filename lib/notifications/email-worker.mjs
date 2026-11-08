import { z } from "zod";

export const captureOrigin = "http://127.0.0.1:54324";
export const captureRecipient = "booking-capture@example.test";
const appOrigin = "http://localhost:3000";

const templates = {
  booking_requested_v1: [
    "New rental request on Rentify",
    "You have a new rental request. Open the booking to review the rental dates and respond before the request expires.",
  ],
  booking_accepted_v1: [
    "Your rental request was accepted",
    "The owner accepted your rental request. Open the booking to check the payment deadline and continue to checkout if payment is still available.",
  ],
  booking_paid_v1: [
    "Payment confirmed for your Rentify booking",
    "Rentify confirmed payment for this booking. Open the booking to check the pickup date and coordinate the handover.",
  ],
  booking_cancelled_v1: [
    "Your Rentify booking was cancelled",
    "This booking was cancelled. Open the booking for its current status and any refund information.",
  ],
  booking_pickup_reminder_v1: [
    "Your Rentify pickup is tomorrow",
    "Pickup is scheduled for tomorrow in Manila time. Check the booking and confirm the pickup arrangements with the other participant.",
  ],
  booking_return_reminder_v1: [
    "Your Rentify return is tomorrow",
    "Return is scheduled for tomorrow in Manila time. Check the booking and confirm the return arrangements with the other participant.",
  ],
};
const claimSchema = z.object({
  id: z.uuid(),
  booking_id: z.uuid(),
  template: z.enum(Object.keys(templates)),
  lease_token: z.uuid().nullable(),
});
const receiptSchema = z.object({ ID: z.string().min(1).max(200) });

export function renderBookingEmail(template, bookingId) {
  const [subject, message] =
    templates[z.enum(Object.keys(templates)).parse(template)];
  const url = new URL("/bookings/" + z.uuid().parse(bookingId), appOrigin);
  return {
    subject,
    text: message + "\n\nView booking: " + url.href + "\n\nRentify",
  };
}

export async function captureBookingEmail(message, send = fetch) {
  try {
    const response = await send(captureOrigin + "/api/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        From: { Email: "bookings@example.test", Name: "Rentify" },
        To: [{ Email: captureRecipient }],
        Subject: message.subject,
        Text: message.text,
      }),
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    if (response.status === 429) return { state: "retry" };
    if (response.status >= 400 && response.status < 500)
      return { state: "failed" };
    if (response.ok) {
      const receipt = receiptSchema.safeParse(await response.json());
      if (receipt.success) return { state: "captured", id: receipt.data.ID };
    }
  } catch {
    // Mailpit offers no deduplication guarantee. A lost acknowledgement may
    // already have produced a message, so it is unsafe to retry automatically.
  }
  return { state: "needs_review" };
}

export async function runBookingEmailBatch(
  admin,
  capture = captureBookingEmail,
) {
  const reminders = await admin.rpc("enqueue_booking_email_reminders");
  if (reminders.error) throw new Error("Reminder discovery failed.");
  const counts = {
    reminders: reminders.data,
    captured: 0,
    skipped: 0,
    retry: 0,
    failed: 0,
    needs_review: 0,
  };
  for (let processed = 0; processed < 20; processed++) {
    const result = await admin.rpc("claim_booking_email");
    if (result.error) throw new Error("Email claim failed.");
    if (result.data.length === 0) break;
    const job = claimSchema.parse(result.data[0]);
    if (!job.lease_token) {
      counts.skipped++;
      continue;
    }
    const outcome = await capture(
      renderBookingEmail(job.template, job.booking_id),
    );
    const finished = await admin.rpc("finish_booking_email", {
      p_id: job.id,
      p_token: job.lease_token,
      p_result: outcome.state,
      ...(outcome.id ? { p_capture_id: outcome.id } : {}),
    });
    if (finished.error || finished.data !== true)
      throw new Error("Email lease outcome could not be recorded.");
    counts[outcome.state]++;
  }
  return counts;
}
