"use client";

import Link from "next/link";

// What shows when the root layout itself fails, which app/error.tsx can't
// catch. It replaces the whole document and gets none of the global styles,
// so it carries its own, inline. Like app/error.tsx it shows only the
// reference (error.digest) that matches the server's log, never the message.

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#05070d", color: "#fff", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", padding: "80px 16px" }}>
        <title>Something went wrong · MAIRO</title>
        <main style={{ maxWidth: 520, textAlign: "center" }}>
          <p style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.3em", color: "rgba(255,255,255,0.8)" }}>MAIRO</p>
          <h1 style={{ marginTop: 32, fontSize: 32, lineHeight: 1.1, letterSpacing: "-0.03em", fontWeight: 600 }}>This page didn&rsquo;t load.</h1>
          <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.6, color: "rgba(255,255,255,0.65)" }}>
            Something went wrong on our side while showing it. Showing a page never changes your ads. If you had just pressed a button, check whether it went through before pressing it again.
          </p>
          <div style={{ marginTop: 32, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={() => retry()} style={{ minHeight: 46, padding: "0 24px", borderRadius: 999, border: 0, background: "#2f6bff", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              Try again
            </button>
            <Link href="/" style={{ minHeight: 46, display: "inline-flex", alignItems: "center", padding: "0 24px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.85)", fontSize: 15, textDecoration: "none" }}>
              Go to the homepage
            </Link>
          </div>
          {error.digest ? (
            <p style={{ marginTop: 32, fontSize: 12.5, color: "rgba(255,255,255,0.45)" }}>
              If it keeps happening, contact support and quote this reference: <span style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.7)" }}>{error.digest}</span>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
