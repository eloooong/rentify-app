import { describe, expect, it } from "vitest";
import { buildSpecs } from "./specs";

// Shapes match the starter templates in lib/catalog/README.md.
const laptops = {
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
};

const vr = {
  version: 1,
  fields: [
    { key: "brand", label: "Brand", type: "text", required: true },
    {
      key: "connection",
      label: "Connection",
      type: "select",
      required: true,
      options: ["standalone", "pc", "console"],
    },
  ],
};

describe("buildSpecs", () => {
  it("lists values in template order with template labels", () => {
    expect(
      buildSpecs(laptops, {
        ram_gb: 16,
        model: "Nitro 5",
        brand: "Acer",
        storage_gb: 2048,
      }),
    ).toEqual([
      { label: "Brand", value: "Acer" },
      { label: "Model", value: "Nitro 5" },
      { label: "RAM (GB)", value: "16" },
      { label: "Storage (GB)", value: "2,048" },
    ]);
  });

  it("skips optional fields that are missing or blank", () => {
    expect(
      buildSpecs(laptops, {
        brand: "Acer",
        model: "X",
        ram_gb: 8,
        storage_gb: "",
      }),
    ).toHaveLength(3);
  });

  it("formats select options for reading", () => {
    expect(buildSpecs(vr, { brand: "Meta", connection: "pc" })).toContainEqual({
      label: "Connection",
      value: "PC",
    });
    expect(
      buildSpecs(vr, { brand: "Meta", connection: "standalone" }),
    ).toContainEqual({ label: "Connection", value: "Standalone" });
  });

  it("ignores keys that are not in the template", () => {
    expect(buildSpecs(vr, { brand: "Meta", secret: "x" })).toEqual([
      { label: "Brand", value: "Meta" },
    ]);
  });

  it("returns nothing for legacy, empty or invalid templates", () => {
    expect(buildSpecs({}, { brand: "Acer" })).toEqual([]);
    expect(buildSpecs(null, { brand: "Acer" })).toEqual([]);
    expect(buildSpecs({ version: 2, fields: [] }, { brand: "Acer" })).toEqual(
      [],
    );
    expect(buildSpecs(laptops, null)).toEqual([]);
  });
});
