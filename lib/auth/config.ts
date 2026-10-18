export function getAppOrigin() {
  const value = process.env.NEXT_PUBLIC_APP_URL;
  if (!value)
    throw new Error("Set NEXT_PUBLIC_APP_URL to your application origin.");
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL must be an HTTP(S) origin without a path.",
    );
  }
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  ) {
    throw new Error("Use HTTPS for a hosted application origin.");
  }
  return url.origin;
}

export function authCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ?? false,
  };
}
