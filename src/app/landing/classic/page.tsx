import type { Metadata } from "next";
import { Home } from "@/components/landing/home";

// The landing page as it was before the story hero, kept so the two can be
// compared on plans created. Served at "/" to the visitors src/proxy.ts puts
// in the "classic" group; this address itself is never indexed.

export const metadata: Metadata = { robots: { index: false, follow: true }, alternates: { canonical: "/" } };

export default function ClassicLanding() {
  return <Home hero="classic" />;
}
