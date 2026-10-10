import type { NextConfig } from "next";
import { canonicalHostRedirects } from "./src/lib/canonical-host";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Creative requests can carry a reference picture as a data URL. The
      // browser downscales it first, but base64 still inflates by a third and
      // the 1MB default would reject perfectly reasonable photos.
      bodySizeLimit: "4mb",
    },
  },

  async redirects() {
    return [
      // Other addresses of the live site (the .vercel.app domain, www) send
      // visitors to the real one in NEXT_PUBLIC_APP_URL. See canonical-host.ts.
      ...canonicalHostRedirects({ VERCEL_ENV: process.env.VERCEL_ENV, NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL }),
      // Audiences was removed; old links and bookmarks land on the dashboard.
      { source: "/dashboard/audiences", destination: "/dashboard", permanent: false },
    ];
  },

  async headers() {
    return [
      {
        // Standard protections on every response. They're also what the
        // security companies that rate a new domain look for. No full
        // Content-Security-Policy: Next's inline scripts, Stripe and Meta's
        // previews would each need careful allowances, and a wrong one breaks
        // pages silently. frame-ancestors alone stops other sites framing MAIRO.
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
      {
        // The sky panorama. Files under public/ are served no-cache by
        // default, because Next has no way to know whether one has changed —
        // which for a background image means every visit spends a round trip
        // revalidating a file that is, by construction, never going to change:
        // the filename carries a version and a new render gets a new one.
        source: "/sky/:file*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
