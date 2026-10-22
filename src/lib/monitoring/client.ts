// Sends a browser crash to /api/monitoring/client-error from the error pages.
// Errors with a digest were thrown on the server and are reported there, so
// only browser-side ones go. Best effort: nothing waits on it or retries.

export function reportClientError(error: Error & { digest?: string }): void {
  if (error.digest || typeof window === "undefined") return;
  try {
    void fetch("/api/monitoring/client-error", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(error.name || "Error").slice(0, 100),
        message: String(error.message || "").slice(0, 2_000),
        stack: error.stack?.slice(0, 8_000),
        path: window.location.pathname.slice(0, 500),
      }),
    }).catch(() => {});
  } catch {
    // Reporting must never be the second failure on an error page.
  }
}
