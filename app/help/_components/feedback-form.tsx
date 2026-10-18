"use client";

import { startTransition, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FEEDBACK_TOPICS,
  MESSAGE_MAX,
  submitFeedback,
  type FeedbackResult,
} from "../_lib/feedback";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";

async function send(
  _previous: FeedbackResult,
  form: FormData,
): Promise<FeedbackResult> {
  return submitFeedback({
    topic: String(form.get("topic") ?? ""),
    message: String(form.get("message") ?? ""),
    email: String(form.get("email") ?? ""),
  });
}

export function FeedbackForm() {
  const [state, action, pending] = useActionState(send, { status: "idle" });
  const fields = state.status === "error" ? state.fields : undefined;

  if (state.status === "success")
    return (
      <p
        role="status"
        className="rounded-lg border border-border bg-surface-muted p-4"
      >
        {state.message}
      </p>
    );

  return (
    // Submitting through onSubmit (not <form action>) stops React from
    // resetting the fields after the action, so a failed attempt never loses
    // what the visitor typed.
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="feedback-topic">Topic</Label>
        <select
          id="feedback-topic"
          name="topic"
          defaultValue="general"
          aria-invalid={fields?.topic ? true : undefined}
          aria-describedby={fields?.topic ? "feedback-topic-error" : undefined}
          className={selectClass}
        >
          {FEEDBACK_TOPICS.map((topic) => (
            <option key={topic.value} value={topic.value}>
              {topic.label}
            </option>
          ))}
        </select>
        {fields?.topic && (
          <p id="feedback-topic-error" className="text-sm text-destructive">
            {fields.topic}
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="feedback-message">Message</Label>
        <Textarea
          id="feedback-message"
          name="message"
          required
          maxLength={MESSAGE_MAX}
          rows={5}
          aria-invalid={fields?.message ? true : undefined}
          aria-describedby={
            fields?.message ? "feedback-message-error" : "feedback-message-hint"
          }
        />
        {fields?.message ? (
          <p id="feedback-message-error" className="text-sm text-destructive">
            {fields.message}
          </p>
        ) : (
          <p
            id="feedback-message-hint"
            className="text-sm text-muted-foreground"
          >
            Please don&apos;t include passwords or payment details.
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="feedback-email">Email (optional)</Label>
        <Input
          id="feedback-email"
          name="email"
          type="email"
          autoComplete="email"
          aria-invalid={fields?.email ? true : undefined}
          aria-describedby={
            fields?.email ? "feedback-email-error" : "feedback-email-hint"
          }
        />
        {fields?.email ? (
          <p id="feedback-email-error" className="text-sm text-destructive">
            {fields.email}
          </p>
        ) : (
          <p id="feedback-email-hint" className="text-sm text-muted-foreground">
            Only if you&apos;d like a reply.
          </p>
        )}
      </div>

      <p
        role="alert"
        aria-live="assertive"
        className="text-sm text-destructive empty:hidden"
      >
        {state.status === "error" ? state.message : ""}
      </p>

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Sending…" : "Send feedback"}
      </Button>
    </form>
  );
}
