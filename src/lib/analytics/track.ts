"use client";

// Privacy-conscious funnel events from the public site: an event name from a
// fixed list and a few fixed-value properties. Never a URL, an email, what
// someone typed, or anything that identifies them. The anonymous id is a
// random value kept in this browser so a funnel can be counted, not a person
// followed — and it's dropped entirely when the browser asks not to be tracked.

export type PublicEvent =
  | { name: "hero_view"; props: { variant: string } }
  | { name: "hero_example"; props: { type: string; variant: string } }
  | { name: "hero_chapter"; props: { chapter: string; variant: string } }
  | { name: "hero_play"; props: { state: "playing" | "paused" | "replay" | "invite"; variant: string } }
  | { name: "preview_start"; props: { source: "url" | "manual" | "example"; variant: string } }
  | { name: "preview_result"; props: { outcome: "facts" | "failed" | "blocked" | "manual"; variant: string } }
  | { name: "preview_complete"; props: { kind: string; variant: string } }
  | { name: "preview_save"; props: { variant: string } }
  | { name: "tool_result"; props: { tool: string } }
  | { name: "walkthrough"; props: { action: "play" | "chapter" | "video" } };

const AID = "mairo:aid";

function anonId(): string | null {
  try {
    if (navigator.doNotTrack === "1") return null;
    let id = window.localStorage.getItem(AID);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(AID, id);
    }
    return id;
  } catch {
    return null;
  }
}

export function track(e: PublicEvent): void {
  try {
    const body = JSON.stringify({ ...e, anonId: anonId() });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    else void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true });
  } catch {
    // Measurement never gets in the way of the page.
  }
}

/** Which hero this visitor sees, kept for the visit so the funnel can compare versions. */
export function heroVariant(): string {
  try {
    const m = document.cookie.match(/(?:^|; )mairo_hero=(story|classic)/);
    return m ? m[1] : "story";
  } catch {
    return "story";
  }
}
