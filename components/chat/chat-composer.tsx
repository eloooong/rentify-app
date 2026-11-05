"use client";

import { useId, type KeyboardEvent, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CHAT_BODY_MAX, chatBodyLength } from "@/lib/listings/chat";

/** The count appears only near the limit, so it doesn't distract otherwise. */
const SHOW_COUNT_FROM = CHAT_BODY_MAX - 200;

/**
 * The message box. Enter sends and Shift+Enter starts a new line, except on
 * touch screens, where the Enter key can only start a new line.
 */
export function ChatComposer({
  value,
  onChange,
  onSubmit,
  error,
  counterpart,
  textareaRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  error: string | null;
  counterpart: string;
  textareaRef: Ref<HTMLTextAreaElement>;
}) {
  const id = useId();
  const length = chatBodyLength(value);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Label htmlFor={id}>Message {counterpart}</Label>
      <div className="flex items-end gap-2">
        <Textarea
          id={id}
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${errorId} ${hintId}` : hintId}
          className="max-h-40 min-h-11 flex-1"
        />
        <Button type="submit" className="h-11 px-4">
          Send
        </Button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-between gap-4 text-xs text-muted-foreground">
        <p id={hintId} className="pointer-coarse:sr-only">
          Enter to send, Shift+Enter for a new line.
        </p>
        {length >= SHOW_COUNT_FROM && (
          <p className="ml-auto">
            {length.toLocaleString("en-PH")} /{" "}
            {CHAT_BODY_MAX.toLocaleString("en-PH")}
          </p>
        )}
      </div>
    </form>
  );
}
