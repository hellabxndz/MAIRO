import type { ClipId } from "@/lib/demo/clip";
import type { Clip } from "./stage";

// Each clip's scenes, loaded only when a clip is drawn live (the renderer, or
// a player whose video file isn't there) — so a page showing the rendered
// files never downloads the components behind them.

const LOADERS: Record<ClipId, () => Promise<Clip>> = {
  creative: () => import("./creative").then((m) => m.CREATIVE_CLIP),
  understand: () => import("./understand").then((m) => m.UNDERSTAND_CLIP),
  campaign: () => import("./campaign").then((m) => m.CAMPAIGN_CLIP),
  team: () => import("./team").then((m) => m.TEAM_CLIP),
  dashboard: () => import("./dashboard").then((m) => m.DASHBOARD_CLIP),
  optimize: () => import("./optimize").then((m) => m.OPTIMIZE_CLIP),
  results: () => import("./results").then((m) => m.RESULTS_CLIP),
  film: () => import("./film").then((m) => m.FILM_CLIP),
};

export function loadClip(id: ClipId): Promise<Clip> {
  return LOADERS[id]();
}
