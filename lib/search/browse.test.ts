import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { RANGE_NOT_SATISFIABLE, searchListings } from "./browse";
import type { BrowseQuery } from "./browse-params";

type Result = {
  data: unknown;
  error: { code: string; message: string } | null;
  count: number | null;
};

/**
 * A minimal stand-in for the Supabase query builder. Every query records its
 * calls; `respond` decides what each awaited query returns, so tests can
 * reproduce PostgREST's behaviour without a database.
 */
function fakeClient(respond: (query: Recorded) => Result) {
  const queries: Recorded[] = [];
  const client = {
    from(table: string) {
      const query = new Recorded(table, respond);
      queries.push(query);
      return query;
    },
  };
  return { client, queries };
}

class Recorded {
  calls: [string, ...unknown[]][] = [];
  constructor(
    readonly table: string,
    private respond: (query: Recorded) => Result,
  ) {}
  private add(name: string, ...args: unknown[]) {
    this.calls.push([name, ...args]);
    return this;
  }
  select(...args: unknown[]) {
    return this.add("select", ...args);
  }
  eq(...args: unknown[]) {
    return this.add("eq", ...args);
  }
  ilike(...args: unknown[]) {
    return this.add("ilike", ...args);
  }
  gte(...args: unknown[]) {
    return this.add("gte", ...args);
  }
  lte(...args: unknown[]) {
    return this.add("lte", ...args);
  }
  order(...args: unknown[]) {
    return this.add("order", ...args);
  }
  in(...args: unknown[]) {
    return this.add("in", ...args);
  }
  range(...args: unknown[]) {
    return this.add("range", ...args);
  }
  get isCountOnly() {
    const select = this.calls.find(([name]) => name === "select");
    return Boolean((select?.[2] as { head?: boolean } | undefined)?.head);
  }
  filters() {
    return this.calls.filter(([name]) =>
      ["eq", "ilike", "gte", "lte"].includes(name),
    );
  }
  then<T>(resolve: (value: Result) => T) {
    return Promise.resolve(this.respond(this)).then(resolve);
  }
}

const base: BrowseQuery = {
  currency: "PHP",
  page: 1,
  pageSize: 20,
  sort: "newest",
};

const listing = { id: "l1", title: "Drone" };

function search(query: BrowseQuery, respond: (query: Recorded) => Result) {
  const fake = fakeClient(respond);
  return {
    // The fake only implements what searchListings calls.
    result: searchListings(
      query,
      fake.client as unknown as Parameters<typeof searchListings>[1],
    ),
    queries: fake.queries,
  };
}

describe("searchListings", () => {
  it("returns listings with photo URLs and the total", async () => {
    const { result } = search(base, (query) =>
      query.table === "listings"
        ? { data: [listing], error: null, count: 1 }
        : {
            data: [{ id: "p1", listing_id: "l1", position: 0 }],
            error: null,
            count: null,
          },
    );
    await expect(result).resolves.toEqual({
      data: [
        {
          ...listing,
          photos: [
            {
              id: "p1",
              position: 0,
              url: "/api/catalog/listings/l1/photos/p1",
            },
          ],
        },
      ],
      pagination: { page: 1, pageSize: 20, total: 1 },
    });
  });

  it("returns an empty page with the real total when the page is past the end (PGRST103)", async () => {
    const query: BrowseQuery = {
      ...base,
      page: 99,
      q: "drone",
      categoryId: "c1",
      maxPrice: 100000,
    };
    const { result, queries } = search(query, (recorded) =>
      recorded.isCountOnly
        ? { data: null, error: null, count: 4 }
        : {
            data: null,
            error: {
              code: RANGE_NOT_SATISFIABLE,
              message: "Requested range not satisfiable",
            },
            count: null,
          },
    );

    await expect(result).resolves.toEqual({
      data: [],
      pagination: { page: 99, pageSize: 20, total: 4 },
    });
    const [page, count] = queries;
    expect(page.calls).toContainEqual(["range", 1960, 1979]);
    // The count query must apply exactly the same filters as the page query.
    expect(count.isCountOnly).toBe(true);
    expect(count.filters()).toEqual(page.filters());
    expect(
      queries.some((recorded) => recorded.table === "listing_photos"),
    ).toBe(false);
  });

  it("still fails on other provider errors", async () => {
    const { result } = search(base, () => ({
      data: null,
      error: { code: "PGRST301", message: "JWT expired" },
      count: null,
    }));
    await expect(result).rejects.toThrow("Unable to load listings.");
  });

  it("fails if the fallback count itself fails", async () => {
    const { result } = search({ ...base, page: 5 }, (recorded) =>
      recorded.isCountOnly
        ? { data: null, error: { code: "500", message: "down" }, count: null }
        : {
            data: null,
            error: { code: RANGE_NOT_SATISFIABLE, message: "range" },
            count: null,
          },
    );
    await expect(result).rejects.toThrow("Unable to load listings.");
  });

  it("escapes LIKE wildcards and backslashes in the search text", async () => {
    const { result, queries } = search({ ...base, q: "100%_\\off" }, () => ({
      data: [],
      error: null,
      count: 0,
    }));
    await result;
    expect(queries[0].calls).toContainEqual([
      "ilike",
      "title",
      "%100\\%\\_\\\\off%",
    ]);
  });
});
