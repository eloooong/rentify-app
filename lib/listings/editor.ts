import { z } from "zod";
import {
  attributesSchema,
  listingSchema,
  updateListingSchema,
} from "@/lib/catalog/validation";
import { pesosToMinor } from "@/lib/search/browse-params";

/*
 * Pure logic for the listing editor (A1.1). Validation reuses Person B's
 * listingSchema and attributesSchema from lib/catalog/validation.ts, so the
 * form and POST/PATCH /api/catalog/listings apply the same rules.
 */

export const MAX_PHOTOS = 8;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Longest side after in-browser resizing; the server resizes to 2560 anyway. */
export const MAX_IMAGE_SIDE = 2048;

export const CONDITIONS = ["Like new", "Very good", "Good", "Fair"] as const;

export type ListingStatus = "draft" | "published" | "paused";

export type TemplateField =
  | { key: string; label: string; type: "text"; required: boolean }
  | {
      key: string;
      label: string;
      type: "integer";
      required: boolean;
      min: number;
      max: number;
    }
  | {
      key: string;
      label: string;
      type: "select";
      required: boolean;
      options: string[];
    };

export type EditorCategory = {
  id: string;
  name: string;
  attributeSchema: unknown;
};

/** What the form holds: everything as the visitor typed it. */
export type EditorValues = {
  categoryId: string;
  title: string;
  description: string;
  price: string;
  deposit: string;
  condition: string;
  pickupArea: string;
  attributes: Record<string, string>;
};

export type EditorField =
  | "categoryId"
  | "title"
  | "description"
  | "price"
  | "deposit"
  | "condition"
  | "pickupArea"
  | `attributes.${string}`;

export type FieldErrors = Partial<Record<EditorField, string>>;

export type ListingPayload = z.input<typeof listingSchema>;

const templateSchema = z.object({
  version: z.literal(1),
  fields: z.array(
    z.discriminatedUnion("type", [
      z.object({
        key: z.string(),
        label: z.string(),
        type: z.literal("text"),
        required: z.boolean(),
      }),
      z.object({
        key: z.string(),
        label: z.string(),
        type: z.literal("integer"),
        required: z.boolean(),
        min: z.number(),
        max: z.number(),
      }),
      z.object({
        key: z.string(),
        label: z.string(),
        type: z.literal("select"),
        required: z.boolean(),
        options: z.array(z.string()),
      }),
    ]),
  ),
});

/** The category's template fields, or none for a legacy/empty template. */
export function templateFields(attributeSchema: unknown): TemplateField[] {
  const parsed = templateSchema.safeParse(attributeSchema);
  return parsed.success ? parsed.data.fields : [];
}

/** Minor units -> a peso string for the form ("12050" -> "120.50"). */
export function minorToPesos(minor: number): string {
  return Number.isInteger(minor / 100)
    ? String(minor / 100)
    : (minor / 100).toFixed(2);
}

/** Template attribute values, typed for the API; blank optional fields dropped. */
export function buildAttributes(
  fields: TemplateField[],
  values: Record<string, string>,
): Record<string, string | number> {
  const attributes: Record<string, string | number> = {};
  for (const field of fields) {
    const raw = (values[field.key] ?? "").trim();
    if (!raw) continue;
    attributes[field.key] =
      field.type === "integer" && /^-?\d+$/.test(raw) ? Number(raw) : raw;
  }
  return attributes;
}

const SERVER_TO_FORM: Record<string, EditorField> = {
  category_id: "categoryId",
  title: "title",
  description: "description",
  daily_price_amount: "price",
  deposit_amount: "deposit",
  condition: "condition",
  pickup_area: "pickupArea",
};

const FIELD_MESSAGES: Partial<Record<EditorField, string>> = {
  categoryId: "Choose a category.",
  title: "Use 3 to 120 characters.",
  description: "Keep the description under 5,000 characters.",
  price: "Enter a daily price above ₱0.",
  deposit: "Enter a deposit of ₱0 or more.",
  condition: "Choose the condition.",
  pickupArea: "Use 3 to 120 characters, for example a neighbourhood.",
};

export type ValidationResult =
  { ok: true; payload: ListingPayload } | { ok: false; fields: FieldErrors };

/**
 * Builds the POST/PATCH payload and checks it with B's schemas. Prices are
 * entered in pesos and sent as integer minor units.
 */
export function validateListing(
  values: EditorValues,
  category: EditorCategory | undefined,
): ValidationResult {
  const fields: FieldErrors = {};
  const price = pesosToMinor(values.price);
  const deposit = values.deposit.trim() ? pesosToMinor(values.deposit) : 0;
  if (price === null || price <= 0) fields.price = FIELD_MESSAGES.price;
  if (deposit === null) fields.deposit = FIELD_MESSAGES.deposit;

  const template = templateFields(category?.attributeSchema);
  const payload: ListingPayload = {
    category_id: values.categoryId,
    title: values.title,
    description: values.description,
    daily_price_amount: price ?? 0,
    deposit_amount: deposit ?? 0,
    currency: "PHP",
    condition: values.condition,
    pickup_area: values.pickupArea,
    attributes: buildAttributes(template, values.attributes),
  };

  const base = listingSchema.safeParse(payload);
  if (!base.success) {
    for (const issue of base.error.issues) {
      const field = SERVER_TO_FORM[String(issue.path[0])];
      if (field && !fields[field]) fields[field] = FIELD_MESSAGES[field];
    }
  }
  if (!category) fields.categoryId = FIELD_MESSAGES.categoryId;
  else {
    const attributes = attributesSchema(category.attributeSchema).safeParse(
      payload.attributes,
    );
    if (!attributes.success) {
      for (const issue of attributes.error.issues) {
        const key = String(issue.path[0] ?? "");
        const field = template.find((item) => item.key === key);
        if (!field) continue;
        fields[`attributes.${key}`] =
          field.type === "integer"
            ? `Enter a whole number from ${field.min} to ${field.max}.`
            : field.type === "select"
              ? `Choose ${field.label.toLowerCase()}.`
              : `Enter ${field.label.toLowerCase()} (up to 80 characters).`;
      }
    }
  }

  return Object.keys(fields).length
    ? { ok: false, fields }
    : { ok: true, payload };
}

/** The PATCH body: the full editable payload plus the status (not partial). */
export function updatePayload(payload: ListingPayload, status: ListingStatus) {
  return updateListingSchema.parse({ ...payload, status });
}

export type ApiProblem = {
  message: string;
  fields?: FieldErrors;
  /** Where the visitor can fix the problem, when it isn't on this form. */
  action?: { href: string; label: string };
};

type ErrorBody = {
  error?: { code?: unknown; message?: unknown; fields?: unknown };
};

/** Turns a catalog API error response into what the editor shows. */
export function interpretApiError(
  status: number,
  body: unknown,
  returnTo: string,
): ApiProblem {
  const error = (body as ErrorBody | null)?.error;
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" ? error.message : "";

  if (status === 401)
    return {
      message: "Your session has ended. Sign in again to save.",
      action: {
        href: `/login?next=${encodeURIComponent(returnTo)}`,
        label: "Sign in",
      },
    };
  if (status === 403 && code === "profile_required")
    return {
      message: "Complete your profile before listing a device.",
      action: { href: "/account", label: "Complete your profile" },
    };
  if (status === 403 && code === "moderated")
    return {
      message:
        "This listing has been restricted by the Rentify team and can't be changed.",
    };
  if (status === 400 && code === "validation") {
    const fields: FieldErrors = {};
    const raw =
      error?.fields && typeof error.fields === "object"
        ? (error.fields as Record<string, unknown>)
        : {};
    for (const [key, value] of Object.entries(raw)) {
      const field = SERVER_TO_FORM[key];
      const text = Array.isArray(value) ? value[0] : value;
      if (field)
        fields[field] = FIELD_MESSAGES[field] ?? String(text ?? "Check this.");
    }
    return {
      message: "Please fix the highlighted fields.",
      ...(Object.keys(fields).length ? { fields } : {}),
    };
  }
  if (status === 400 && code === "invalid_listing")
    return {
      message:
        "This listing can't be saved like that. Publishing needs at least one photo, and a published listing must be paused before its last photo is removed.",
    };
  if (status === 409 && code === "conflict")
    return {
      message:
        "That photo slot is already used. Refresh the page and try again.",
    };
  if (status === 413)
    return { message: "That photo is too large. Use an image under 4 MB." };
  if (status === 415)
    return {
      message: "That file isn't a supported photo. Use JPEG, PNG or WebP.",
    };
  if (message && status < 500) return { message };
  return { message: "We couldn't save right now. Please try again shortly." };
}

/** Photo positions (0–7) not already used, lowest first. */
export function freePositions(used: number[], needed: number): number[] {
  const taken = new Set(used);
  const free: number[] = [];
  for (
    let position = 0;
    position < MAX_PHOTOS && free.length < needed;
    position++
  )
    if (!taken.has(position)) free.push(position);
  return free;
}

/** Scales width × height to fit inside a square of `max`, never enlarging. */
export function fitWithin(width: number, height: number, max = MAX_IMAGE_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
