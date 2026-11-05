import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  claimsEnabled,
  claimsOrigin,
  userSupabaseConfig,
} from "./lib/claims/config";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const secureHeaders = (res: NextResponse) => {
    res.headers.set("Cache-Control", "private, no-store, max-age=0");
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    res.headers.set("Referrer-Policy", "same-origin");
    return res;
  };
  if (!claimsEnabled()) return secureHeaders(response);
  try {
    const { url, key } = userSupabaseConfig();
    const db = createServerClient(url, key, {
      cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: claimsOrigin().startsWith("https:"),
        path: "/",
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values, headers) => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([name, value]) =>
            response.headers.set(name, value),
          );
        },
      },
    });
    // Identity/permissions are checked again in each page/handler and in RLS.
    await db.auth.getClaims();
  } catch {
    return secureHeaders(
      new NextResponse("Account services are temporarily unavailable.", {
        status: 503,
      }),
    );
  }
  return secureHeaders(response);
}
export const config = {
  matcher: [
    "/account/:path*",
    "/claim/:path*",
    "/admin/claims/:path*",
    "/api/account/:path*",
    "/api/claims/:path*",
  ],
};
