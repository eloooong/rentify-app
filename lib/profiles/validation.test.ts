import { expect, it } from "vitest";
import { profileSchema } from "./validation";

it("trims names and phones and clears a blank optional phone", () => {
  expect(
    profileSchema.parse({ displayName: "  Angel  ", phone: "  " }),
  ).toEqual({ displayName: "Angel", phone: null });
  expect(
    profileSchema.parse({ displayName: "Angel", phone: " +639171234567 " })
      .phone,
  ).toBe("+639171234567");
});
it.each(["", " ", "x".repeat(81), "name\nname", "name\u0000name"])(
  "rejects an invalid display name",
  (displayName) => {
    expect(profileSchema.safeParse({ displayName, phone: "" }).success).toBe(
      false,
    );
  },
);
it.each([
  "09171234567",
  "+012345678",
  "+123",
  "+1234567890123456",
  "+63 917 1234567",
])("rejects invalid international phone numbers", (phone) => {
  expect(profileSchema.safeParse({ displayName: "Angel", phone }).success).toBe(
    false,
  );
});
