import { describe, expect, it } from "vitest";
import {
  buildAttributes,
  fitWithin,
  freePositions,
  interpretApiError,
  minorToPesos,
  templateFields,
  updatePayload,
  validateListing,
  type EditorCategory,
  type EditorValues,
} from "./editor";

// Same shape as the starter "laptops" template in lib/catalog/README.md.
const laptops: EditorCategory = {
  id: "0b5c7d2e-8a4f-4e3b-b2c1-7d9e6f5a4b02",
  name: "Laptops",
  attributeSchema: {
    version: 1,
    fields: [
      { key: "brand", label: "Brand", type: "text", required: true },
      { key: "model", label: "Model", type: "text", required: true },
      {
        key: "ram_gb",
        label: "RAM (GB)",
        type: "integer",
        required: true,
        min: 1,
        max: 256,
      },
      {
        key: "storage_gb",
        label: "Storage (GB)",
        type: "integer",
        required: false,
        min: 1,
        max: 8192,
      },
    ],
  },
};

const values: EditorValues = {
  categoryId: laptops.id,
  title: "Acer Nitro 5",
  description: "Charger included.",
  price: "500",
  deposit: "2,500",
  condition: "Good",
  pickupArea: "Laoag City",
  attributes: { brand: "Acer", model: "Nitro 5", ram_gb: "16", storage_gb: "" },
};

describe("validateListing", () => {
  it("builds the API payload in minor units with typed attributes", () => {
    const result = validateListing(values, laptops);
    expect(result).toEqual({
      ok: true,
      payload: {
        category_id: laptops.id,
        title: "Acer Nitro 5",
        description: "Charger included.",
        daily_price_amount: 50000,
        deposit_amount: 250000,
        currency: "PHP",
        condition: "Good",
        pickup_area: "Laoag City",
        attributes: { brand: "Acer", model: "Nitro 5", ram_gb: 16 },
      },
    });
  });

  it("treats a blank deposit as zero", () => {
    const result = validateListing({ ...values, deposit: "" }, laptops);
    expect(result.ok && result.payload.deposit_amount).toBe(0);
  });

  it("reports the base fields with plain-language messages", () => {
    const result = validateListing(
      {
        ...values,
        title: "TV",
        price: "0",
        deposit: "abc",
        condition: "",
        pickupArea: "x",
      },
      laptops,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fields).sort()).toEqual([
      "condition",
      "deposit",
      "pickupArea",
      "price",
      "title",
    ]);
  });

  it("reports template attribute problems per field", () => {
    const result = validateListing(
      { ...values, attributes: { brand: "", model: "X", ram_gb: "1024" } },
      laptops,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields["attributes.brand"]).toMatch(/brand/);
    expect(result.fields["attributes.ram_gb"]).toBe(
      "Enter a whole number from 1 to 256.",
    );
  });

  it("requires a category", () => {
    const result = validateListing({ ...values, categoryId: "" }, undefined);
    expect(!result.ok && result.fields.categoryId).toBe("Choose a category.");
  });
});

describe("updatePayload", () => {
  it("adds the status to the full payload for PATCH", () => {
    const result = validateListing(values, laptops);
    if (!result.ok) throw new Error("expected a valid payload");
    expect(updatePayload(result.payload, "published")).toMatchObject({
      status: "published",
      daily_price_amount: 50000,
    });
  });
});

describe("helpers", () => {
  it("reads template fields and ignores legacy templates", () => {
    expect(templateFields(laptops.attributeSchema)).toHaveLength(4);
    expect(templateFields({})).toEqual([]);
  });

  it("types integer attributes and keeps invalid ones as text for validation", () => {
    const fields = templateFields(laptops.attributeSchema);
    expect(buildAttributes(fields, { ram_gb: "8", brand: " Acer " })).toEqual({
      ram_gb: 8,
      brand: "Acer",
    });
    expect(buildAttributes(fields, { ram_gb: "eight" })).toEqual({
      ram_gb: "eight",
    });
  });

  it("converts minor units back to pesos for editing", () => {
    expect(minorToPesos(50000)).toBe("500");
    expect(minorToPesos(41050)).toBe("410.50");
  });

  it("finds free photo positions", () => {
    expect(freePositions([0, 2], 3)).toEqual([1, 3, 4]);
    expect(freePositions([0, 1, 2, 3, 4, 5, 6, 7], 1)).toEqual([]);
  });

  it("fits images inside the size limit without enlarging", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("interpretApiError", () => {
  it("sends an expired session to sign in with a return path", () => {
    expect(interpretApiError(401, null, "/owner/listings/new")).toMatchObject({
      action: { href: "/login?next=%2Fowner%2Flistings%2Fnew" },
    });
  });

  it("points to the profile when one is required", () => {
    expect(
      interpretApiError(
        403,
        { error: { code: "profile_required", message: "x" } },
        "/",
      ),
    ).toMatchObject({ action: { href: "/account" } });
  });

  it("maps server validation fields onto form fields", () => {
    const problem = interpretApiError(
      400,
      {
        error: {
          code: "validation",
          message: "Check the supplied fields.",
          fields: { daily_price_amount: ["Too small"], pickup_area: ["x"] },
        },
      },
      "/",
    );
    expect(Object.keys(problem.fields ?? {}).sort()).toEqual([
      "pickupArea",
      "price",
    ]);
  });

  it("explains the publishing rule and falls back safely", () => {
    expect(
      interpretApiError(400, { error: { code: "invalid_listing" } }, "/")
        .message,
    ).toMatch(/at least one photo/);
    expect(interpretApiError(503, null, "/").message).toMatch(/couldn't save/);
  });
});
