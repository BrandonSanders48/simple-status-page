import { NextResponse, type NextRequest } from "next/server";

/**
 * Ported from the old PHP app: ?dark=1 forces dark mode on, ?dark=0 forces it off,
 * and either persists via the dark_mode cookie so it sticks on later visits without
 * the query param. Mutating request.cookies (not just the response) is required so
 * the very same request's Server Component render sees the new value immediately.
 */
export function middleware(request: NextRequest) {
  const dark = request.nextUrl.searchParams.get("dark");
  if (dark === null) return NextResponse.next();

  const value = dark === "1" ? "on" : "off";
  request.cookies.set("dark_mode", value);
  const response = NextResponse.next({ request });
  response.cookies.set("dark_mode", value, { path: "/", maxAge: 31536000 });
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
