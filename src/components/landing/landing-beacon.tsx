"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics/track";

// Counts one landing view for the version comparison — a name and the version,
// nothing else (lib/analytics/track.ts). The server keeps one per visitor a day.

export function LandingBeacon({ variant }: { variant: "story" | "classic" }) {
  useEffect(() => {
    track({ name: "hero_view", props: { variant } });
  }, [variant]);
  return null;
}
