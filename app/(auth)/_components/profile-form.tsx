"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ProfileState } from "@/lib/profiles/validation";
import { saveProfile } from "../account/actions";

export function ProfileForm({
  displayName,
  phone,
  phoneVerified,
}: {
  displayName: string;
  phone: string;
  phoneVerified: boolean;
}) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(
    saveProfile,
    { status: "idle" },
  );
  const [nameValue, setNameValue] = useState(displayName);
  const [phoneValue, setPhoneValue] = useState(phone);
  const messageRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.message) messageRef.current?.focus();
  }, [state]);
  return (
    <form action={action} className="space-y-5" aria-labelledby="profile-title">
      <div className="space-y-2">
        <h2 id="profile-title" className="text-xl font-semibold">
          Your profile
        </h2>
        <p className="text-sm text-muted-foreground">
          Your display name is public. Your phone number is optional and visible
          only to you.
        </p>
      </div>
      {state.message && (
        <p
          ref={messageRef}
          tabIndex={-1}
          role={state.status === "error" ? "alert" : "status"}
          className="text-sm"
        >
          {state.message}
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          name="displayName"
          autoComplete="nickname"
          required
          maxLength={80}
          value={nameValue}
          onChange={(event) => setNameValue(event.target.value)}
          aria-invalid={!!state.errors?.displayName}
          aria-describedby={
            state.errors?.displayName ? "displayName-error" : undefined
          }
          className="min-h-11"
        />
        {state.errors?.displayName && (
          <p id="displayName-error" className="text-sm text-destructive">
            {state.errors.displayName.join(" ")}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone number (optional)</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          maxLength={16}
          placeholder="+639171234567"
          value={phoneValue}
          onChange={(event) => setPhoneValue(event.target.value)}
          aria-invalid={!!state.errors?.phone}
          aria-describedby={
            state.errors?.phone ? "phone-hint phone-error" : "phone-hint"
          }
          className="min-h-11"
        />
        <p id="phone-hint" className="text-sm text-muted-foreground">
          Include + and the country code. Leave blank to remove it.{" "}
          {phoneValue && phoneVerified && phoneValue === phone
            ? "Verified."
            : "Saving a number does not verify it."}
        </p>
        {state.errors?.phone && (
          <p id="phone-error" className="text-sm text-destructive">
            {state.errors.phone.join(" ")}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending} className="min-h-11 w-full">
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
