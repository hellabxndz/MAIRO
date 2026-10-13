import { Home } from "@/components/landing/home";

// The landing page everyone sees by default: the animated product story and
// a real preview of the visitor's own campaign. A share of visitors sees the
// page as it was (/landing/classic) while the two are compared — see
// src/proxy.ts.

export default function Page() {
  return <Home hero="story" />;
}
