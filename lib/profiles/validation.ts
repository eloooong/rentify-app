import { z } from "zod";

export const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Enter a display name.")
    .max(80, "Use 80 characters or fewer.")
    .refine(
      (value) =>
        !Array.from(value).some(
          (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
        ),
      "Use a single line without control characters.",
    ),
  phone: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\+[1-9][0-9]{7,14}$/.test(value),
      "Use an international number, for example +639171234567.",
    )
    .transform((value) => value || null),
});

export type ProfileState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: { displayName?: string[]; phone?: string[] };
};
