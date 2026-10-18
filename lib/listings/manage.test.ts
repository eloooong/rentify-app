import { describe, expect, it } from "vitest";
import {
  deleteSteps,
  listingActions,
  statusChangeBody,
  type ManagedListing,
} from "./manage";

function listing(overrides: Partial<ManagedListing> = {}): ManagedListing {
  return {
    id: "11111111-1111-4111-8111-000000000001",
    owner_id: "22222222-2222-4222-8222-222222222222",
    category_id: "00000000-0000-4000-8000-000000000003",
    title: "Lenovo ThinkPad T14",
    description: "Charger included.",
    daily_price_amount: 45000,
    deposit_amount: 300000,
    currency: "PHP",
    condition: "Very good",
    pickup_area: "Batac",
    attributes: { brand: "Lenovo", model: "T14", ram_gb: 16 },
    status: "published",
    created_at: "2026-10-18T00:00:00Z",
    updated_at: "2026-10-18T00:00:00Z",
    photos: [
      { id: "p1", position: 0, url: "/p1" },
      { id: "p2", position: 1, url: "/p2" },
    ],
    hasBookings: false,
    ...overrides,
  } as ManagedListing;
}

describe("listingActions", () => {
  it("lets a published listing be paused but not published again", () => {
    const actions = listingActions(listing());
    expect(actions.pause.allowed).toBe(true);
    expect(actions.publish.allowed).toBe(false);
    expect(actions.edit.allowed).toBe(true);
    expect(actions.remove.allowed).toBe(true);
  });

  it("only allows publishing a draft or paused listing that has a photo", () => {
    expect(listingActions(listing({ status: "draft" })).publish.allowed).toBe(
      true,
    );
    expect(
      listingActions(listing({ status: "paused", photos: [] })).publish,
    ).toEqual({ allowed: false, reason: "Add a photo before publishing." });
  });

  it("blocks deleting a listing with booking history", () => {
    expect(listingActions(listing({ hasBookings: true })).remove).toMatchObject(
      { allowed: false, reason: expect.stringMatching(/booking history/) },
    );
  });

  it("blocks every action on a restricted listing", () => {
    const actions = listingActions(listing({ status: "hidden" }));
    for (const action of Object.values(actions))
      expect(action).toMatchObject({ allowed: false });
  });
});

describe("statusChangeBody", () => {
  it("sends the full stored payload with the new status", () => {
    expect(statusChangeBody(listing(), "paused")).toEqual({
      category_id: "00000000-0000-4000-8000-000000000003",
      title: "Lenovo ThinkPad T14",
      description: "Charger included.",
      daily_price_amount: 45000,
      deposit_amount: 300000,
      currency: "PHP",
      condition: "Very good",
      pickup_area: "Batac",
      attributes: { brand: "Lenovo", model: "T14", ram_gb: 16 },
      status: "paused",
    });
  });
});

describe("deleteSteps", () => {
  it("returns a published listing to draft, removes photos, then deletes", () => {
    expect(deleteSteps(listing())).toEqual([
      { kind: "draft" },
      { kind: "photo", photoId: "p1" },
      { kind: "photo", photoId: "p2" },
      { kind: "listing" },
    ]);
  });

  it("skips the draft step for drafts and deletes a photo-less draft directly", () => {
    expect(deleteSteps(listing({ status: "draft", photos: [] }))).toEqual([
      { kind: "listing" },
    ]);
  });
});
