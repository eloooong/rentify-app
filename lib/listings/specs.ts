import { z } from "zod";

export type Spec = { label: string; value: string };

// Display-only reading of a category's attribute_schema. Validation of saved
// values is Person B's job (lib/catalog/validation.ts); this only needs the
// field order, labels and types, and tolerates anything it doesn't recognise.
const templateSchema = z.object({
  version: z.literal(1),
  fields: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      type: z.enum(["text", "integer", "select"]),
    }),
  ),
});

/** Short option values such as "pc" read better upper-cased ("PC"). */
function formatOption(value: string): string {
  if (/^[a-z]{1,3}$/.test(value)) return value.toUpperCase();
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/[_-]/g, " ");
}

/**
 * Turns a listing's attributes into labelled specs, in the template's field
 * order. Blank or missing values and keys that are not in the template are
 * skipped. An invalid or empty template yields no specs.
 */
export function buildSpecs(template: unknown, attributes: unknown): Spec[] {
  const parsed = templateSchema.safeParse(template);
  if (!parsed.success || !attributes || typeof attributes !== "object")
    return [];
  const values = attributes as Record<string, unknown>;

  const specs: Spec[] = [];
  for (const field of parsed.data.fields) {
    const raw = values[field.key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (field.type === "integer" && typeof raw === "number") {
      specs.push({
        label: field.label,
        value: new Intl.NumberFormat("en-PH").format(raw),
      });
    } else if (field.type === "select" && typeof raw === "string") {
      specs.push({ label: field.label, value: formatOption(raw) });
    } else if (typeof raw === "string" || typeof raw === "number") {
      specs.push({ label: field.label, value: String(raw).trim() });
    }
  }
  return specs;
}
