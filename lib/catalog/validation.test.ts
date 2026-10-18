import { expect, it } from "vitest";
import {
  listingSchema,
  updateListingSchema,
  attributesSchema,
  querySchema,
} from "./validation";
const listing = {
  category_id: "72000000-0000-4000-8000-000000000001",
  title: "Camera",
  daily_price_amount: 10000,
  condition: "Good",
  pickup_area: "Campus",
};
it("uses integer minor units and safe create defaults", () => {
  expect(listingSchema.parse(listing)).toMatchObject({
    currency: "PHP",
    deposit_amount: 0,
    attributes: {},
  });
  expect(
    listingSchema.safeParse({ ...listing, daily_price_amount: 10.5 }).success,
  ).toBe(false);
});
it.each([{ owner_id: "forged" }, { status: "published" }, { id: "forged" }])(
  "rejects injected identity or creation status",
  (extra) => {
    expect(listingSchema.safeParse({ ...listing, ...extra }).success).toBe(
      false,
    );
  },
);
it("does not permit a client moderation state", () => {
  expect(
    updateListingSchema.safeParse({ ...listing, status: "hidden" }).success,
  ).toBe(false);
});
it("bounds pagination and separates currency filters", () => {
  expect(querySchema.parse({})).toMatchObject({
    currency: "PHP",
    page: 1,
    pageSize: 20,
  });
  expect(querySchema.safeParse({ pageSize: "100000" }).success).toBe(false);
  expect(
    querySchema.safeParse({ minPrice: "20", maxPrice: "10" }).success,
  ).toBe(false);
  expect(querySchema.safeParse({ owner_id: "other" }).success).toBe(false);
});
it("enforces required, typed, bounded and known category attributes", () => {
  const schema = attributesSchema({
    version: 1,
    fields: [
      { key: "brand", label: "Brand", type: "text", required: true },
      {
        key: "ram_gb",
        label: "RAM",
        type: "integer",
        required: true,
        min: 1,
        max: 256,
      },
      {
        key: "connection",
        label: "Connection",
        type: "select",
        required: false,
        options: ["pc", "standalone"],
      },
    ],
  });
  expect(schema.safeParse({ brand: "Dell", ram_gb: 16 }).success).toBe(true);
  for (const input of [
    { ram_gb: 16 },
    { brand: "Dell", ram_gb: "16" },
    { brand: "Dell", ram_gb: 300 },
    { brand: "Dell", ram_gb: 16, privateKey: "x" },
    { brand: "Dell", ram_gb: 16, connection: "unknown" },
  ])
    expect(schema.safeParse(input).success).toBe(false);
});
