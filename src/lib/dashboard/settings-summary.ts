import type { AutomationLevel } from "@/generated/prisma/enums";

// One line per folded setting, for Settings in Simple mode. The forms sit
// behind "Advanced settings", but whether MAIRO may act on its own is never
// hidden: each line says what is switched on right now. Pure; pinned by
// scripts/check-simple-ui.ts.

export type SettingsSummaryInput = {
  autoLaunchOn: boolean;
  stopLossCents: number | null;
  stopLossAction: "NOTIFY" | "PAUSE";
  monthlyCapCents: number | null;
  level: AutomationLevel;
  /** The plan includes automatic changes; without it MAIRO only recommends, whatever is stored. */
  autoOptimizeAllowed: boolean;
};

export type SummaryLine = { anchor: string; label: string; value: string };

const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export function advancedSettingsSummary(s: SettingsSummaryInput): SummaryLine[] {
  const protection = [
    s.stopLossCents !== null ? `${s.stopLossAction === "PAUSE" ? "pauses" : "warns you about"} a campaign that spends ${dollars(s.stopLossCents)} with no result` : null,
    s.monthlyCapCents !== null ? `${dollars(s.monthlyCapCents)} monthly limit` : null,
  ].filter(Boolean) as string[];
  const level: Record<AutomationLevel, string> = {
    MANUAL: "Manual — MAIRO recommends, you approve every change",
    ASSISTED: "AI Assist — small changes inside your limits, without asking",
    AUTOPILOT: "Full Autopilot — MAIRO optimizes inside your limits",
  };
  return [
    { anchor: "go-live", label: "Go live without asking me", value: s.autoLaunchOn ? "On" : "Off — MAIRO waits for you to press launch" },
    { anchor: "spend-protection", label: "Spend Protection", value: protection.length ? capitalize(protection.join(" · ")) : "Off" },
    { anchor: "automation", label: "What MAIRO may do on its own", value: s.autoOptimizeAllowed || s.level === "MANUAL" ? level[s.level] : `${level.MANUAL} (your plan doesn't include automatic changes)` },
    { anchor: "brief", label: "Your brief", value: "Your sign-up answers — goal, budget, audience, brand voice" },
  ];
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
