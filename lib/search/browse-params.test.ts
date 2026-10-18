import { describe, expect, it } from "vitest";
import {
  browseHref,
  parseBrowseParams,
  pesosToMinor,
  type CategoryOption,
} from "./browse-params";

const categories: CategoryOption[] = [
  {
    id: "6f9a3f9e-2f2b-4c1d-9a1e-3b6c1f2a9d01",
    slug: "drones",
    name: "Drones",
  },
  {
    id: "0b5c7d2e-8a4f-4e3b-b2c1-7d9e6f5a4b02",
    slug: "laptops",
    name: "Laptops",
  },
];

describe("pesosToMinor", () => {
  it("converts pesos to integer centavos", () => {
    expect(pesosToMinor("500")).toBe(50000);
    expect(pesosToMinor("1,250.50")).toBe(125050);
    expect(pesosToMinor("0.5")).toBe(50);
  });

  it("rejects values that are not plain amounts", () => {
    for (const bad of ["", "-5", "abc", "1.234", "1e3", "12 000"]) {
      expect(pesosToMinor(bad)).toBeNull();
    }
  });
});

describe("parseBrowseParams", () => {
  it("defaults to newest, page 1, 20 per page in PHP", () => {
    const result = parseBrowseParams({}, categories);
    expect(result.error).toBeNull();
    expect(result.query).toEqual({
      currency: "PHP",
      page: 1,
      pageSize: 20,
      sort: "newest",
    });
  });

  it("maps friendly URL values onto the catalog query", () => {
    const result = parseBrowseParams(
      {
        q: "  mavic ",
        category: "drones",
        min: "300",
        max: "1,000",
        sort: "price_asc",
        page: "2",
      },
      categories,
    );
    expect(result.error).toBeNull();
    expect(result.query).toMatchObject({
      q: "mavic",
      categoryId: categories[0].id,
      minPrice: 30000,
      maxPrice: 100000,
      sort: "price_asc",
      page: 2,
    });
    expect(result.form.q).toBe("mavic");
  });

  it("falls back to safe values for an unknown sort or a bad page", () => {
    const result = parseBrowseParams(
      { sort: "cheapest", page: "-3" },
      categories,
    );
    expect(result.form.sort).toBe("newest");
    expect(result.page).toBe(1);
    expect(result.query?.page).toBe(1);
  });

  it("uses the first value when a param is repeated", () => {
    const result = parseBrowseParams({ q: ["camera", "drone"] }, categories);
    expect(result.query?.q).toBe("camera");
  });

  it("explains an unknown category instead of ignoring it", () => {
    const result = parseBrowseParams({ category: "phones" }, categories);
    expect(result.query).toBeNull();
    expect(result.error).toMatch(/category/i);
  });

  it("explains an invalid or reversed price range", () => {
    expect(parseBrowseParams({ min: "cheap" }, categories).error).toMatch(
      /numbers/,
    );
    const reversed = parseBrowseParams({ min: "900", max: "100" }, categories);
    expect(reversed.query).toBeNull();
    expect(reversed.error).toMatch(/minimum price is higher/);
  });

  it("rejects searches longer than the catalog allows", () => {
    const result = parseBrowseParams({ q: "x".repeat(101) }, categories);
    expect(result.error).toMatch(/100 characters/);
  });
});

describe("browseHref", () => {
  const form = {
    q: "drone",
    category: "drones",
    min: "",
    max: "800",
    sort: "newest" as const,
  };

  it("keeps filters, drops empty and default values", () => {
    expect(browseHref(form)).toBe("/listings?q=drone&category=drones&max=800");
  });

  it("adds a page only beyond the first", () => {
    expect(browseHref(form, { page: 1 })).not.toContain("page=");
    expect(browseHref(form, { page: 3 })).toContain("page=3");
  });

  it("can switch category while keeping the search", () => {
    expect(browseHref(form, { category: "" })).toBe(
      "/listings?q=drone&max=800",
    );
  });
});
