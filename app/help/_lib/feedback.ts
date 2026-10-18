/*
 * Feedback form contract (PROPOSED: Person B's POST /api/feedback, B3.4, does
 * not exist yet). Request and error shapes follow the existing catalog API
 * (lib/catalog/README.md) so the endpoint can be built to match:
 *
 *   POST /api/feedback   Content-Type: application/json, same-origin cookies
 *   { "topic": "general" | "bug" | "safety" | "accessibility",
 *     "message": string (10–2000 chars),
 *     "email"?: string (optional, only for a reply) }
 *
 *   201 or 200 -> { data: ... }                   success
 *   400        -> { error: { code, message, fields? } }  invalid input
 *   429        -> too many submissions
 *   404 / 405  -> endpoint not deployed yet
 *
 * Until B ships the endpoint, the form tells the visitor that feedback is not
 * available yet instead of pretending it was sent.
 */

export const FEEDBACK_TOPICS = [
  { value: "general", label: "General question" },
  { value: "bug", label: "Something isn't working" },
  { value: "safety", label: "Safety or trust concern" },
  { value: "accessibility", label: "Accessibility" },
] as const;

export type FeedbackTopic = (typeof FEEDBACK_TOPICS)[number]["value"];
export type FeedbackField = "topic" | "message" | "email";
export type FeedbackInput = { topic: string; message: string; email: string };

export type FeedbackResult =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      fields?: Partial<Record<FeedbackField, string>>;
    };

export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;

/** Client-side checks so the visitor sees problems before submitting. */
export function validateFeedback(input: FeedbackInput): FeedbackResult | null {
  const fields: Partial<Record<FeedbackField, string>> = {};
  if (!FEEDBACK_TOPICS.some((topic) => topic.value === input.topic))
    fields.topic = "Choose a topic.";
  const message = input.message.trim();
  if (message.length < MESSAGE_MIN)
    fields.message = `Write at least ${MESSAGE_MIN} characters.`;
  else if (message.length > MESSAGE_MAX)
    fields.message = `Keep it under ${MESSAGE_MAX} characters.`;
  const email = input.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fields.email = "Enter a valid email address, or leave it blank.";
  return Object.keys(fields).length
    ? { status: "error", message: "Please fix the highlighted fields.", fields }
    : null;
}

type ErrorBody = {
  error?: {
    message?: unknown;
    fields?: Record<string, unknown>;
  };
};

/** Turns an HTTP response from POST /api/feedback into what the form shows. */
export function interpretFeedbackResponse(
  status: number,
  body: unknown,
): FeedbackResult {
  if (status === 200 || status === 201)
    return {
      status: "success",
      message: "Thanks, we received your feedback.",
    };
  if (status === 404 || status === 405)
    return {
      status: "error",
      message:
        "Sending feedback isn't available yet. Please try again after the next update.",
    };
  if (status === 429)
    return {
      status: "error",
      message: "You've sent several messages in a row. Please wait a moment.",
    };
  if (status === 400) {
    const error = (body as ErrorBody | null)?.error;
    const fields: Partial<Record<FeedbackField, string>> = {};
    for (const key of ["topic", "message", "email"] as const) {
      const value = error?.fields?.[key];
      const text = Array.isArray(value) ? value[0] : value;
      if (typeof text === "string") fields[key] = text;
    }
    return {
      status: "error",
      message:
        typeof error?.message === "string"
          ? error.message
          : "Please check your message and try again.",
      ...(Object.keys(fields).length ? { fields } : {}),
    };
  }
  return {
    status: "error",
    message: "We couldn't send your feedback. Please try again shortly.",
  };
}

export async function submitFeedback(
  input: FeedbackInput,
): Promise<FeedbackResult> {
  const invalid = validateFeedback(input);
  if (invalid) return invalid;
  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        topic: input.topic,
        message: input.message.trim(),
        ...(input.email.trim() ? { email: input.email.trim() } : {}),
      }),
    });
    const body = await response.json().catch(() => null);
    return interpretFeedbackResponse(response.status, body);
  } catch {
    return interpretFeedbackResponse(0, null);
  }
}
