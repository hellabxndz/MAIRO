import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/aios");

  if (!isProtected) return NextResponse.next();

  if (!session?.user) {
    const signInUrl = new URL("/sign-in", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (pathname.startsWith("/aios") && session.user.role !== "OWNER") {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  if (
    (pathname.startsWith("/dashboard") || pathname.startsWith("/onboarding")) &&
    session.user.role === "OWNER"
  ) {
    return NextResponse.redirect(new URL("/aios", req.nextUrl.origin));
  }

  // Server Components can't read the current pathname directly, only params.
  // Stamp it onto a request header here so dashboard/layout.tsx (which needs
  // it to avoid redirect-looping on /dashboard/meta itself) can read it back
  // via headers().
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
});

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/aios/:path*"],
};
