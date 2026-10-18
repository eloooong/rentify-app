import { z } from "zod";

export const uuidSchema = z.uuid();
const amount = z.number().int().min(0).max(2147483647);
export const listingSchema = z
  .object({
    category_id: uuidSchema,
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(5000).default(""),
    daily_price_amount: amount.positive(),
    deposit_amount: amount.default(0),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default("PHP"),
    condition: z.string().trim().min(1).max(80),
    pickup_area: z.string().trim().min(3).max(120),
    attributes: z
      .record(
        z.string().max(32),
        z.union([z.string().trim().min(1).max(80), z.number().int()]),
      )
      .default({}),
  })
  .strict();
export const updateListingSchema = listingSchema.extend({
  status: z.enum(["draft", "published", "paused"]),
});
export const querySchema = z
  .object({
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default("PHP"),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    q: z.string().trim().max(100).optional(),
    categoryId: uuidSchema.optional(),
    minPrice: z.coerce.number().int().min(0).max(2147483647).optional(),
    maxPrice: z.coerce.number().int().min(0).max(2147483647).optional(),
    sort: z.enum(["newest", "price_asc", "price_desc"]).default("newest"),
  })
  .strict()
  .refine(
    (query) =>
      query.minPrice === undefined ||
      query.maxPrice === undefined ||
      query.minPrice <= query.maxPrice,
    { message: "Minimum price exceeds maximum price.", path: ["minPrice"] },
  );
export const ownQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    id: uuidSchema.optional(),
  })
  .strict();

const fieldSchema = z.discriminatedUnion("type", [
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
]);
export function attributesSchema(template: unknown) {
  const empty =
    template &&
    typeof template === "object" &&
    Object.keys(template).length === 0;
  const fields = empty
    ? []
    : z
        .object({ version: z.literal(1), fields: z.array(fieldSchema) })
        .parse(template).fields;
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    let rule: z.ZodType =
      field.type === "text"
        ? z.string().trim().min(1).max(80)
        : field.type === "integer"
          ? z.number().int().min(field.min).max(field.max)
          : z.enum(field.options as [string, ...string[]]);
    if (!field.required) rule = rule.optional();
    shape[field.key] = rule;
  }
  return z.object(shape).strict();
}
