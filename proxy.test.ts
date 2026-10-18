import { expect, it } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "./proxy";

it("cannot bypass protected-route matching by adding an image/file extension", () => {
  for (const path of [
    "/account",
    "/owner/photo.png",
    "/account/download.svg",
    "/bookings/123",
    "/admin/report.json",
    "/auth/callback?code=example",
  ]) {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: `https://rentify.example${path}`,
      }),
    ).toBe(true);
  }
  for (const path of [
    "/_next/static/app.js",
    "/_next/image?url=example",
    "/icon.svg",
    "/favicon.ico",
  ]) {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: `https://rentify.example${path}`,
      }),
    ).toBe(false);
  }
});
