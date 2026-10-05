import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyClaims, type Role } from "./lib/auth";

// Role-based access for the two private areas of the site:
//   /portal/** → astrologers only
//   /admin/**  → admins only
// Anyone else is sent to the home page with the sign-in window open.
const AREAS: { prefix: string; role: Role; login: string }[] = [
  { prefix: "/portal", role: "astrologer", login: "portal" },
  { prefix: "/admin", role: "admin", login: "admin" },
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const area = AREAS.find((a) => pathname === a.prefix || pathname.startsWith(a.prefix + "/"));
  if (!area) return NextResponse.next();

  const claims = await verifyClaims(request.cookies.get(SESSION_COOKIE)?.value);
  if (claims?.role === area.role) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.search = `?login=${area.login}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/portal", "/portal/:path*", "/admin", "/admin/:path*"],
};
