// The setup screens' answers before they're finished.
//
// Saved after every screen, so closing the tab, a failed save, or coming back
// on another device starts where they stopped rather than from a blank form.
// Cleared once the intake is saved — from then on the intake is the record.

import { z } from "zod";

export const SCREENS = ["business", "learn", "goal"] as const;
export type Screen = (typeof SCREENS)[number];

const text = (max: number) => z.string().trim().max(max).optional().catch(undefined);

export const draftSchema = z.object({
  screen: z.enum(SCREENS).optional().catch(undefined),
  business: z
    .object({
      website: text(300),
      industry: text(120),
      offering: text(200),
      customerLocation: text(120),
      savedAt: z.string().optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
  learn: z
    .object({
      at: z.string(),
      ok: z.boolean(),
      note: z.string().nullable().catch(null),
    })
    .optional()
    .catch(undefined),
  goal: z
    .object({
      primaryGoal: text(40),
      monthlyBudget: z.number().optional().catch(undefined),
      destinationType: text(40),
      messageChannel: text(40),
      phone: text(40),
      currentOffer: text(200),
      targetAudience: text(1000),
      brandVoice: text(1000),
      competitors: text(500),
      notes: text(2000),
    })
    .optional()
    .catch(undefined),
});

export type OnboardingDraft = z.infer<typeof draftSchema>;

export function parseDraft(raw: unknown): OnboardingDraft {
  const r = draftSchema.safeParse(raw ?? {});
  return r.success ? r.data : {};
}

/**
 * Which setup screen to open: the one asked for, or the one they stopped at.
 * A later screen isn't opened before the business is saved (there'd be nothing
 * to read), and "MAIRO learns" is skipped without a website.
 */
export function resumeScreen(draft: OnboardingDraft, website: string | null, asked?: string | null): Screen {
  const wanted = (SCREENS as readonly string[]).includes(asked ?? "") ? (asked as Screen) : null;
  let screen: Screen = wanted ?? draft.screen ?? "business";
  if (!draft.business?.savedAt) screen = "business";
  if (screen === "learn" && !website) screen = "goal";
  return screen;
}
