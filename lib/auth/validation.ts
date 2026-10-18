import { z } from "zod";

const email = z.string().trim().email("Enter a valid email address.").max(254);
const password = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(128, "Use no more than 128 characters.");

export const emailSchema = z.object({ email });
export const loginSchema = emailSchema.extend({
  password: z.string().min(1, "Enter your password.").max(128),
});
export const signupSchema = emailSchema.extend({ password });
export const passwordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match.",
  });

export type AuthState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: Partial<Record<"email" | "password" | "confirmPassword", string[]>>;
};

const protectedRoots = [
  "/account",
  "/update-password",
  "/owner",
  "/bookings",
  "/checkout",
  "/messages",
  "/admin",
  "/checklists",
];
export function isProtectedPath(path: string) {
  return protectedRoots.some(
    (root) => path === root || path.startsWith(root + "/"),
  );
}

/** Return only local application paths; never reflect arbitrary redirect URLs. */
export function safeReturnPath(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !value.startsWith("/")
  )
    return "/account";
  try {
    const decoded = decodeURIComponent(value);
    if (
      decoded.startsWith("//") ||
      decoded.includes("\\") ||
      Array.from(decoded).some((char) => char.charCodeAt(0) <= 32)
    )
      return "/account";
    const url = new URL(value, "https://rentify.invalid");
    if (
      url.origin !== "https://rentify.invalid" ||
      !isProtectedPath(url.pathname)
    )
      return "/account";
    return url.pathname + url.search;
  } catch {
    return "/account";
  }
}
