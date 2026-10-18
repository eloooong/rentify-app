import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions } from "@/lib/auth/config";
import { isProtectedPath, safeReturnPath } from "@/lib/auth/validation";
import type { Database } from "./database.types";

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const protectedPath = isProtectedPath(path);
  const authPath = [
    "/login",
    "/signup",
    "/forgot-password",
    "/verify-email",
    "/auth",
  ].some((root) => path === root || path.startsWith(root + "/"));
  let response = NextResponse.next({ request });
  const privateResponse = (result: NextResponse) => {
    result.headers.set("Cache-Control", "private, no-store, max-age=0");
    result.headers.set("Pragma", "no-cache");
    result.headers.set("Expires", "0");
    return result;
  };
  const finish = (result: NextResponse) => {
    response.cookies.getAll().forEach((cookie) => result.cookies.set(cookie));
    return privateResponse(result);
  };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return protectedPath
      ? finish(
          new NextResponse(
            "Sign-in is temporarily unavailable. Please try again later.",
            { status: 503 },
          ),
        )
      : authPath
        ? privateResponse(response)
        : response;
  }
  const hasSession = request.cookies
    .getAll()
    .some(({ name }) => name.startsWith("sb-") && name.includes("auth-token"));
  if (!protectedPath && !hasSession)
    return authPath ? privateResponse(response) : response;

  const client = createServerClient<Database>(url, key, {
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        // Keep cookies from earlier writes when the SDK writes more than once.
        const previous = response.cookies.getAll();
        response = NextResponse.next({ request });
        previous.forEach((cookie) => response.cookies.set(cookie));
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([name, value]) =>
          response.headers.set(name, value),
        );
      },
    },
  });
  try {
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (
      protectedPath &&
      error &&
      (!("status" in error) || !error.status || error.status >= 500)
    ) {
      return finish(
        new NextResponse(
          "Sign-in is temporarily unavailable. Please try again later.",
          { status: 503 },
        ),
      );
    }
    if (protectedPath && (error || !user?.email_confirmed_at)) {
      const login = request.nextUrl.clone();
      login.pathname = "/login";
      login.search = "";
      login.searchParams.set(
        "next",
        safeReturnPath(path + request.nextUrl.search),
      );
      return finish(NextResponse.redirect(login, 303));
    }
    // Profile roles and administration permissions are not implemented yet.
    if (path === "/admin" || path.startsWith("/admin/")) {
      return finish(
        new NextResponse("Administration is not available yet.", {
          status: 403,
        }),
      );
    }
    return privateResponse(response);
  } catch {
    return protectedPath
      ? finish(
          new NextResponse(
            "Sign-in is temporarily unavailable. Please try again later.",
            { status: 503 },
          ),
        )
      : privateResponse(response);
  }
}
