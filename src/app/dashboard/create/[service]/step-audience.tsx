"use client";

import { useState, useTransition } from "react";
import type { SpecialAdCategory } from "@/generated/prisma/enums";
import { searchPlacesAction } from "@/lib/actions/campaign-actions";
import { AGE_CEILING, AGE_FLOOR, RADIUS_CHOICES, SPECIAL_CATEGORY_MIN_RADIUS } from "@/lib/campaigns/audience";
import { PLACEMENT_OPTIONS } from "@/lib/campaigns/placements";
import type { CampaignPlan } from "@/lib/campaigns/plan";
import type { Place } from "@/lib/meta/places";
import { inputClass } from "@/components/ui";
import { Choice, Note, Question, SubQuestion } from "./wizard-parts";

const CATEGORIES: { value: SpecialAdCategory | null; label: string }[] = [
  { value: null, label: "None of these" },
  { value: "HOUSING", label: "Housing — homes for sale or rent" },
  { value: "EMPLOYMENT", label: "Jobs — hiring or job listings" },
  { value: "FINANCIAL_PRODUCTS_SERVICES", label: "Credit, loans or financial services" },
  { value: "ISSUES_ELECTIONS_POLITICS", label: "Social issues, elections or politics" },
];

/** A business people visit or call, where reaching the whole country wastes the budget. */
export function isLocal(plan: CampaignPlan): boolean {
  return plan.promotes === "SERVICE" || plan.destinationType === "PHONE_CALL";
}

/** What "Let MAIRO find my customers" will do, said before they rely on it. */
export function aiAudienceStrategy(plan: CampaignPlan): string {
  const where = plan.geoLabel
    ? `people within ${plan.specialAdCategory ? Math.max(SPECIAL_CATEGORY_MIN_RADIUS, plan.geoRadius) : plan.geoRadius} miles of ${plan.geoLabel}`
    : "adults across the US";
  const widen = plan.specialAdCategory
    ? "Because of the special category, Meta keeps to exactly this area and every adult age."
    : "Meta's Advantage+ audience then finds the people within it most likely to respond — it learns from who actually clicks and buys.";
  return `Start with ${where}, 18 and over. ${widen}`;
}

/** Step 3 — who sees the ad. */
export function StepAudience({
  plan,
  update,
  mode,
}: {
  plan: CampaignPlan;
  update: (patch: Partial<CampaignPlan>) => void;
  mode: "simple" | "advanced";
}) {
  const special = plan.specialAdCategory !== null;
  const local = isLocal(plan);

  return (
    <Question title="Who do you want to reach?" sub="You can always review this before anything launches.">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Choice
          selected={plan.audienceMode === "ai"}
          onClick={() => update({ audienceMode: "ai" })}
          label="Let Mairo find my customers"
          sub="MAIRO suggests an audience from your business, and Meta refines it as results come in"
        />
        <Choice
          selected={plan.audienceMode === "manual"}
          onClick={() => update({ audienceMode: "manual" })}
          label="I want to choose my audience"
          sub="Set the place, ages and who to reach yourself"
        />
      </div>

      {plan.audienceMode === "ai" ? (
        <SubQuestion title="Based on your business, here's the audience strategy I recommend">
          {local && (
            <div className="mb-4">
              <p className="mb-2 text-[13px] text-white">
                Your customers come to you or call you, so the ad should stay near you. Where are you based?
              </p>
              <PlaceSearch plan={plan} update={update} />
            </div>
          )}
          <Note>{aiAudienceStrategy(plan)}</Note>
        </SubQuestion>
      ) : (
        <SubQuestion title="Your audience">
          <p className="mb-2 text-[13px] text-white">Where are your customers?</p>
          <PlaceSearch plan={plan} update={update} />
          <p className="mt-1.5 text-[11.5px] text-faint">Leave it empty to advertise across the whole US.</p>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-[13px] text-white">How old are they?</p>
              <div className="mt-2 flex items-center gap-2">
                <input type="number" min={AGE_FLOOR} max={AGE_CEILING} value={plan.ageMin} disabled={special}
                  onChange={(e) => update({ ageMin: Number(e.target.value) })} aria-label="Youngest" className={`${inputClass} w-20`} />
                <span className="text-[13px] text-muted">to</span>
                <input type="number" min={AGE_FLOOR} max={AGE_CEILING} value={plan.ageMax} disabled={special}
                  onChange={(e) => update({ ageMax: Number(e.target.value) })} aria-label="Oldest" className={`${inputClass} w-20`} />
                {plan.ageMax >= AGE_CEILING && <span className="text-[12px] text-faint">and over</span>}
              </div>
            </div>
            <div>
              <p className="text-[13px] text-white">Anyone in particular?</p>
              <div className="mt-2 flex gap-2">
                {[{ v: 0, l: "Everyone" }, { v: 2, l: "Women" }, { v: 1, l: "Men" }].map((g) => (
                  <button key={g.v} type="button" disabled={special} aria-pressed={plan.genders === g.v}
                    onClick={() => update({ genders: g.v })}
                    className="rounded-lg border px-3 py-2 text-[13px] transition disabled:opacity-40"
                    style={{
                      borderColor: plan.genders === g.v ? "rgba(108,158,255,0.5)" : "var(--mairo-line)",
                      background: plan.genders === g.v ? "rgba(61,125,255,0.08)" : "transparent",
                      color: plan.genders === g.v ? "white" : undefined,
                    }}>
                    {g.l}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {mode === "advanced" && (
            <p className="mt-4 text-[11.5px] text-faint">
              Interests, custom audiences, lookalikes and exclusions are coming in a later update — they&rsquo;re not
              shown until they actually change the campaign.
            </p>
          )}
        </SubQuestion>
      )}

      <SubQuestion
        title="Is this ad about any of these?"
        sub="Meta has stricter rules for these ads. Saying so up front keeps the ad from being rejected."
      >
        <div className="grid gap-2.5 sm:grid-cols-2">
          {CATEGORIES.map((c) => (
            <Choice key={c.label} selected={plan.specialAdCategory === c.value} onClick={() => update({ specialAdCategory: c.value })} label={c.label} />
          ))}
        </div>
        {special && plan.specialAdCategory !== "ISSUES_ELECTIONS_POLITICS" && (
          <div className="mt-3">
            <Note>
              Meta doesn&rsquo;t allow these ads to target by age or gender, or within less than {SPECIAL_CATEGORY_MIN_RADIUS} miles,
              so MAIRO shows them to every adult in the area.
            </Note>
          </div>
        )}
        {plan.specialAdCategory === "ISSUES_ELECTIONS_POLITICS" && (
          <div className="mt-3">
            <Note tone="warn">
              Political and social-issue ads need Meta&rsquo;s ad authorization and a &ldquo;Paid for by&rdquo; disclaimer, which
              MAIRO doesn&rsquo;t set up yet — so this campaign can&rsquo;t be built here.
            </Note>
          </div>
        )}
      </SubQuestion>

      {mode === "advanced" && plan.service !== "tiktok" && (
        <SubQuestion title="Where should it show?" sub="Meta usually gets more for your money when it can choose.">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Choice selected={!plan.choosingPlacements} onClick={() => update({ choosingPlacements: false })}
              label="Let Meta choose (recommended)" sub="Facebook, Instagram, Stories, Reels — wherever it works best" />
            <Choice selected={plan.choosingPlacements}
              onClick={() => update({ choosingPlacements: true, placements: plan.placements.length ? plan.placements : ["FACEBOOK_FEED", "INSTAGRAM_FEED"] })}
              label="I'll choose" sub="Only the places you tick" />
          </div>
          {plan.choosingPlacements && (
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {PLACEMENT_OPTIONS.map((p) => {
                const on = plan.placements.includes(p.value);
                return (
                  <Choice key={p.value} selected={on} label={`${on ? "✓ " : ""}${p.label}`} sub={p.sub}
                    onClick={() => update({ placements: on ? plan.placements.filter((x) => x !== p.value) : [...plan.placements, p.value] })} />
                );
              })}
            </div>
          )}
        </SubQuestion>
      )}
    </Question>
  );
}

/** A town, searched against Meta — it targets by its own id and there are eleven Austins. */
function PlaceSearch({ plan, update }: { plan: CampaignPlan; update: (patch: Partial<CampaignPlan>) => void }) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function search() {
    start(async () => {
      setError(null);
      const result = await searchPlacesAction(query);
      if (result.ok) setPlaces(result.places);
      else setError(result.error);
    });
  }

  if (plan.geoKey) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-lg border px-3 py-2 text-[13px] text-white" style={{ borderColor: "rgba(108,158,255,0.5)" }}>
          {plan.geoLabel}
        </span>
        <select value={plan.geoRadius} onChange={(e) => update({ geoRadius: Number(e.target.value) })}
          className="rounded-lg border bg-transparent px-2 py-2 text-[13px] text-white outline-none" style={{ borderColor: "var(--mairo-line)" }}>
          {RADIUS_CHOICES.map((r) => (
            <option key={r} value={r} className="bg-neutral-900">within {r} miles</option>
          ))}
        </select>
        <button type="button" onClick={() => { update({ geoKey: null, geoLabel: null }); setPlaces(null); setQuery(""); }}
          className="text-[12px] text-muted underline underline-offset-4 hover:text-white">
          Change
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }}
          placeholder="Your town or city" aria-label="Town or city" className={`${inputClass} max-w-xs`} />
        <button type="button" onClick={search} disabled={pending || query.trim().length < 2}
          className="rounded-lg border px-3 py-2 text-[13px] text-white/85 transition hover:text-white disabled:opacity-40" style={{ borderColor: "var(--mairo-line)" }}>
          {pending ? "Looking…" : "Find it"}
        </button>
      </div>
      {error && <p className="mt-2 text-[12px] text-amber-200/90">{error}</p>}
      {places && places.length === 0 && <p className="mt-2 text-[12px] text-amber-200/90">Meta doesn&rsquo;t know that one. Try the nearest bigger town.</p>}
      {places && places.length > 0 && (
        <ul className="mt-2 max-w-md overflow-hidden rounded-lg border" style={{ borderColor: "var(--mairo-line)" }}>
          {places.map((p) => (
            <li key={p.key}>
              <button type="button" onClick={() => update({ geoKey: p.key, geoLabel: p.label })}
                className="w-full px-3 py-2 text-left text-[13px] text-white/85 transition hover:bg-white/[0.04] hover:text-white">
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
