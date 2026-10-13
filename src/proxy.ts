import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

// The landing page comparison: the story hero ("story", the default) against
// the page as it was ("classic"). A visitor is put in one group on their first
// visit and stays there for 30 days, so the funnel can count plans created per
// version. HERO_CLASSIC_PERCENT sets the share who see the old page (default
// 20; 0 turns the comparison off). Crawlers always get the default page.
// ?hero=story or ?hero=classic picks one, for checking both.
const HERO_COOKIE = "mairo_hero";
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|lighthouse/i;

function classicShare(): number {
  const n = Number(process.env.HERO_CLASSIC_PERCENT ?? "20");
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 20;
}

function landing(req: NextRequest): NextResponse {
  const forced = req.nextUrl.searchParams.get("hero");
  const saved = req.cookies.get(HERO_COOKIE)?.value;
  const bot = BOT.test(req.headers.get("user-agent") ?? "");
  let variant: "story" | "classic";
  let set = false;
  if (forced === "story" || forced === "classic") {
    variant = forced;
    set = true;
  } else if (!bot && (saved === "story" || saved === "classic")) {
    variant = classicShare() === 0 ? "story" : saved;
  } else if (bot) {
    variant = "story";
  } else {
    variant = Math.random() * 100 < classicShare() ? "classic" : "story";
    set = true;
  }
  const res = variant === "classic" ? NextResponse.rewrite(new URL("/landing/classic", req.nextUrl.origin)) : NextResponse.next();
  // Not httpOnly: the page reads it to label its funnel events. It holds only the group name.
  if (set) res.cookies.set(HERO_COOKIE, variant, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", secure: req.nextUrl.protocol === "https:" });
  return res;
}

const withAuth = auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // The free plan's review and activation screens (/plan, /plan/activate).
  const isPlan = pathname === "/plan" || pathname.startsWith("/plan/");
  const isProtected =
    isPlan ||
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
    (pathname.startsWith("/dashboard") || pathname.startsWith("/onboarding") || isPlan) &&
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

// The landing page never touches the session: no auth cookies for visitors who only read it.
export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (req.nextUrl.pathname === "/") return landing(req);
  // NextAuth types its wrapper as a route handler; as a proxy it receives the request and the fetch event.
  return withAuth(req as Parameters<typeof withAuth>[0], event as unknown as Parameters<typeof withAuth>[1]);
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/onboarding/:path*", "/aios/:path*", "/plan/:path*"],
};
