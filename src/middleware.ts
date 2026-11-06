import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/jwt";

const MANAGEMENT_PREFIXES = [
  "/dashboard",
  "/employees",
  "/positions",
  "/shifts",
  "/schedules",
  "/availability",
  "/requests",
  "/attendance",
  "/payroll",
  "/reports",
  "/settings",
  "/kiosk",
];

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (pathname === "/") {
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.redirect(
      new URL(
        session.role === "EMPLOYEE" ? "/employee/profile" : "/dashboard",
        request.url,
      ),
    );
  }

  if (pathname.startsWith("/login") || pathname.startsWith("/forgot-password")) {
    if (session) {
      return NextResponse.redirect(
        new URL(
          session.role === "EMPLOYEE" ? "/employee/profile" : "/dashboard",
          request.url,
        ),
      );
    }
    return NextResponse.next();
  }

  const isManagementRoute = MANAGEMENT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const isEmployeeRoute =
    pathname === "/employee" || pathname.startsWith("/employee/");

  if (isManagementRoute || isEmployeeRoute) {
    if (!session) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (isManagementRoute && session.role === "EMPLOYEE") {
      return NextResponse.redirect(new URL("/employee/profile", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icons|images|manifest.json).*)",
  ],
};

