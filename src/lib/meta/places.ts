import { metaGraphRequest } from "@/lib/meta/client";
import { loadCredentials } from "@/lib/ad-platforms/connections";

// Turning a town somebody typed into the id Meta targets by.
//
// "Austin" is not something Meta accepts — it wants a key from its own
// targeting search, and there are eleven Austins. So the customer types, Meta
// answers with real places, and they pick the one they meant. Nothing is
// guessed on their behalf: an ad running around the wrong Austin spends the
// whole budget before anybody notices, and looks exactly like an ad nobody
// wanted.
//
// Cities only, on purpose. A radius means something around a town and nothing
// around a country, and offering regions and countries in the same list is how
// somebody ends up advertising to Texas when they meant a suburb.

export type Place = {
  /** Meta's own id, which is what the targeting spec carries. */
  key: string;
  /** "Austin, Texas, United States" — enough to tell the eleven apart. */
  label: string;
};

export async function searchPlaces(
  organizationId: string,
  query: string
): Promise<{ ok: true; places: Place[] } | { ok: false; error: string }> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { ok: true, places: [] };

  const creds = await loadCredentials(organizationId, "META");
  if (!creds) {
    return { ok: false, error: "Connect your Meta account first — it's Meta that knows the places." };
  }

  try {
    const res = await metaGraphRequest<{
      data?: { key?: string; name?: string; region?: string; country_name?: string }[];
    }>("/search", {
      accessToken: creds.accessToken,
      params: {
        type: "adgeolocation",
        location_types: JSON.stringify(["city"]),
        q: trimmed,
        limit: 8,
      },
    });

    const places: Place[] = [];
    for (const row of res.data ?? []) {
      if (!row.key || !row.name) continue;
      places.push({
        key: row.key,
        label: [row.name, row.region, row.country_name].filter(Boolean).join(", "),
      });
    }
    return { ok: true, places };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Meta couldn't look that up: ${error.message}`
          : "Meta couldn't look that up.",
    };
  }
}
