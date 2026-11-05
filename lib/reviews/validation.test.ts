import { expect, it } from "vitest";
import { reviewInput, reviewQuery, reviewSchema } from "./validation";

it("accepts rating-only reviews and trims optional public text consistently", () => {
  expect(reviewInput.parse({ rating: 5 })).toEqual({ rating: 5, comment: "" });
  expect(
    reviewInput.parse({ rating: 1, comment: "  Hello\nworld  " }).comment,
  ).toBe("Hello\nworld");
  expect(
    reviewInput.parse({ rating: 3, comment: "🎉".repeat(2000) }).comment,
  ).toHaveLength(4000);
});
it.each([0, 6, 1.5, "5", null])("rejects invalid rating %j", (rating) => {
  expect(reviewInput.safeParse({ rating }).success).toBe(false);
});
it("rejects caller-controlled identities, oversized comments and NUL", () => {
  for (const input of [
    { rating: 5, author_id: "forged" },
    { rating: 5, subject_id: "forged" },
    { rating: 5, booking_id: "forged" },
    { rating: 5, comment: "🎉".repeat(2001) },
    { rating: 5, comment: "private\0suffix" },
  ])
    expect(reviewInput.safeParse(input).success).toBe(false);
});
it("bounds public pagination and permits only known role filters", () => {
  expect(reviewQuery.parse({})).toEqual({ page: 1, pageSize: 20 });
  for (const input of [
    { role: "admin" },
    { page: 0 },
    { pageSize: 51 },
    { author_id: "other" },
  ]) {
    expect(reviewQuery.safeParse(input).success).toBe(false);
  }
});
it("rejects private booking identity in a public review response", () => {
  const id = "a1000000-0000-4000-8000-000000000001";
  const value = {
    id,
    author_id: id,
    subject_id: id,
    author_name: "Public name",
    subject_role: "owner",
    rating: 5,
    comment: "",
    created_at: "2026-11-05T00:00:00Z",
  };
  expect(reviewSchema.safeParse(value).success).toBe(true);
  expect(reviewSchema.safeParse({ ...value, booking_id: id }).success).toBe(
    false,
  );
});
