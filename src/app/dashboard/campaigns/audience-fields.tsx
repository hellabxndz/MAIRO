"use client";

import { useState, useTransition } from "react";
import { searchPlacesAction } from "@/lib/actions/campaign-actions";
import { AGE_CEILING, AGE_FLOOR, RADIUS_CHOICES } from "@/lib/campaigns/audience";
import type { Place } from "@/lib/meta/places";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-white/30";

// Who should see this, asked the way somebody who runs a shop would answer.
//
// Ads Manager puts this behind a map, a radius slider and a box of interests.
// The two questions a business can actually answer are where its customers are
// and roughly how old they are, and MAIRO was asking neither — so every ad ran
// nationwide at every age.
//
// The town is searched against Meta rather than typed free-hand, because Meta
// targets by its own id and there are eleven Austins. Picking the wrong one
// spends the budget somewhere else entirely and looks like an ad that failed.
export function AudienceFields() {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [chosen, setChosen] = useState<Place | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [radius, setRadius] = useState(10);
  const [ageMin, setAgeMin] = useState(AGE_FLOOR);
  const [ageMax, setAgeMax] = useState(AGE_CEILING);
  const [genders, setGenders] = useState(0);
  const [pending, start] = useTransition();

  function search() {
    start(async () => {
      setError(null);
      const result = await searchPlacesAction(query);
      if (result.ok) setPlaces(result.places);
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-5">
      <input type="hidden" name="geoKey" value={chosen?.key ?? ""} />
      <input type="hidden" name="geoLabel" value={chosen?.label ?? ""} />
      <input type="hidden" name="geoRadius" value={chosen ? radius : ""} />
      <input type="hidden" name="ageMin" value={ageMin} />
      <input type="hidden" name="ageMax" value={ageMax} />
      <input type="hidden" name="genders" value={genders} />

      <div className="space-y-1.5">
        <label htmlFor="town" className="text-xs font-medium text-neutral-400">
          Where are your customers?
        </label>
        {chosen ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-lg border border-white/20 bg-white/[0.06] px-3 py-2 text-sm text-white">
              {chosen.label}
            </span>
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-white outline-none focus:border-white/30"
            >
              {RADIUS_CHOICES.map((r) => (
                <option key={r} value={r} className="bg-neutral-900">
                  within {r} miles
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setChosen(null);
                setPlaces(null);
                setQuery("");
              }}
              className="text-xs text-neutral-400 underline underline-offset-4 hover:text-white"
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <input
                id="town"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // A form with a search box in it submits on Enter, which
                  // would create the campaign while they were still typing
                  // where it should run.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    search();
                  }
                }}
                placeholder="Your town or city"
                className={`${inputClass} max-w-xs`}
              />
              <button
                type="button"
                onClick={search}
                disabled={pending || query.trim().length < 2}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-neutral-200 transition hover:border-white/30 disabled:opacity-40"
              >
                {pending ? "Looking…" : "Find it"}
              </button>
            </div>
            <p className="text-xs text-neutral-600">
              Leave this empty to advertise across the whole country.
            </p>
          </>
        )}

        {error && <p className="text-xs text-amber-300">{error}</p>}

        {!chosen && places && places.length === 0 && (
          <p className="text-xs text-amber-300">
            Meta doesn&apos;t know that one. Try the nearest bigger town.
          </p>
        )}

        {!chosen && places && places.length > 0 && (
          <ul className="max-w-md divide-y divide-white/5 overflow-hidden rounded-lg border border-white/10">
            {places.map((place) => (
              <li key={place.key}>
                <button
                  type="button"
                  onClick={() => setChosen(place)}
                  className="w-full px-3 py-2 text-left text-sm text-neutral-200 transition hover:bg-white/[0.04] hover:text-white"
                >
                  {place.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-neutral-400">How old are they?</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={AGE_FLOOR}
              max={AGE_CEILING}
              value={ageMin}
              onChange={(e) => setAgeMin(Number(e.target.value))}
              aria-label="Youngest"
              className={`${inputClass} w-20`}
            />
            <span className="text-sm text-neutral-500">to</span>
            <input
              type="number"
              min={AGE_FLOOR}
              max={AGE_CEILING}
              value={ageMax}
              onChange={(e) => setAgeMax(Number(e.target.value))}
              aria-label="Oldest"
              className={`${inputClass} w-20`}
            />
            {ageMax >= AGE_CEILING && <span className="text-xs text-neutral-600">and over</span>}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-neutral-400">Anyone in particular?</label>
          <div className="flex gap-2">
            {[
              { value: 0, label: "Everyone" },
              { value: 2, label: "Women" },
              { value: 1, label: "Men" },
            ].map((g) => (
              <button
                key={g.value}
                type="button"
                aria-pressed={genders === g.value}
                onClick={() => setGenders(g.value)}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  genders === g.value
                    ? "border-white/40 bg-white/[0.06] text-white"
                    : "border-white/10 bg-white/5 text-neutral-300 hover:border-white/25"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
