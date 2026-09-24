"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#04050d", color: "#eef0fb", fontFamily: "system-ui", display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <p>Something went wrong.</p>
          <button onClick={reset} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 10 }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
