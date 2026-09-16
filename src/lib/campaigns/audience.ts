// Who an ad is shown to, in the three things a business can actually answer.
//
// Ads Manager asks this as a screen of its own: a map, a radius, sliders, a
// dozen interest boxes and a reach estimate that moves as you touch them. Most
// of it is not answerable by somebody who runs a shop, and the part that is —
// where my customers are, roughly how old they are — was the part MAIRO never
// asked at all.
//
// So every campaign MAIRO built targeted the whole United States, every age,
// everyone. That is not a neutral default. For a plumber in Austin it is the
// entire budget spent on people who will never call him, and it looks exactly
// like an ad that simply did not work.
//
// Three questions, in the words a customer would use. Interests are
// deliberately not among them: picking them well needs knowledge of Meta's
// taxonomy, picking them badly narrows an audience until it cannot deliver, and
// Meta's own advice for small budgets is to leave them alone.

export type Audience = {
  /** Meta's own id for the place, from its targeting search. Null is nationwide. */
  geoKey: string | null;
  /** What that place is called, to say it back to them. */
  geoLabel: string | null;
  /** Miles around it. Meta's own unit for this field. */
  geoRadius: number | null;
  ageMin: number;
  ageMax: number;
  /** 0 everyone, 1 men, 2 women — Meta's numbering, kept rather than translated. */
  genders: number;
};

/** Meta will not target under-18s, and 65 is where its top bucket starts. */
export const AGE_FLOOR = 18;
export const AGE_CEILING = 65;

/** The distances Meta accepts around a city, and that a person can picture. */
export const RADIUS_CHOICES = [5, 10, 25, 50] as const;

export const AUDIENCE_DEFAULTS: Audience = {
  geoKey: null,
  geoLabel: null,
  geoRadius: 10,
  ageMin: AGE_FLOOR,
  ageMax: AGE_CEILING,
  genders: 0,
};

/**
 * Brings an answer inside what Meta will accept, rather than letting it be
 * refused at launch.
 *
 * A form can be posted from a console, and an age of 4 or a range the wrong way
 * round is rejected by Meta with a message about a field the customer never saw.
 * Swapping a reversed range is deliberate: somebody who typed 65 and 25 meant
 * 25 to 65, and refusing them over the order is pedantry.
 */
export function normalizeAudience(input: Partial<Audience>): Audience {
  const min = clampAge(input.ageMin ?? AUDIENCE_DEFAULTS.ageMin);
  const max = clampAge(input.ageMax ?? AUDIENCE_DEFAULTS.ageMax);

  const geoKey = input.geoKey?.trim() || null;
  const radius = input.geoRadius ?? AUDIENCE_DEFAULTS.geoRadius;

  return {
    geoKey,
    // A label with no key is a place Meta cannot target, so it is not kept —
    // showing somebody "Austin, TX" under an ad running nationwide is a lie.
    geoLabel: geoKey ? input.geoLabel?.trim() || null : null,
    // Meaningless without a place, and Meta rejects a radius with no city.
    geoRadius: geoKey ? clampRadius(radius) : null,
    ageMin: Math.min(min, max),
    ageMax: Math.max(min, max),
    genders: input.genders === 1 || input.genders === 2 ? input.genders : 0,
  };
}

function clampAge(value: number): number {
  if (!Number.isFinite(value)) return AUDIENCE_DEFAULTS.ageMin;
  return Math.min(AGE_CEILING, Math.max(AGE_FLOOR, Math.round(value)));
}

function clampRadius(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 10;
  // Meta's own bounds for a city radius in miles.
  return Math.min(50, Math.max(1, Math.round(value)));
}

/**
 * The targeting spec Meta is sent.
 *
 * genders is omitted entirely for "everyone" rather than sent as [1,2]: the two
 * mean the same delivery, but an explicit list tells Meta the advertiser made a
 * choice, and Meta's own guidance is that an unset field lets it optimize.
 */
export function metaTargeting(audience: Audience): Record<string, unknown> {
  // `cities`, not `custom_locations`. They are different fields: a key from
  // Meta's targeting search belongs in cities, while custom_locations takes a
  // latitude and longitude. Meta rejects a key sent to the wrong one, at
  // launch, with a message that names neither.
  const geo = audience.geoKey
    ? {
        cities: [
          { key: audience.geoKey, radius: audience.geoRadius ?? 10, distance_unit: "mile" },
        ],
      }
    : { countries: ["US"] };

  return {
    geo_locations: geo,
    age_min: audience.ageMin,
    age_max: audience.ageMax,
    ...(audience.genders === 0 ? {} : { genders: [audience.genders] }),
  };
}

/** How the audience reads back on the campaign, in a line. */
export function describeAudience(audience: Audience): string {
  const where = audience.geoLabel
    ? `${audience.geoLabel} + ${audience.geoRadius ?? 10} miles`
    : "everywhere in the US";
  const who =
    audience.genders === 1 ? "men" : audience.genders === 2 ? "women" : "people";
  const age =
    audience.ageMax >= AGE_CEILING ? `${audience.ageMin}+` : `${audience.ageMin}–${audience.ageMax}`;
  return `${who} aged ${age}, ${where}`;
}
