import { metaGraphRequest } from "@/lib/meta/client";
import { countMatchFields } from "@/lib/tracking/hash";

// Meta's pixel, from creating one to proving it works.
//
// Three separate things live here because they are three separate APIs that
// happen to share an id:
//
//   The Marketing API creates the pixel on the ad account.
//   The pixel node reports when it last saw an event — the only honest way to
//   answer "is this installed?", and the reason MAIRO can tell a customer
//   their tracking is broken instead of showing them an empty ROAS column.
//   The Conversions API takes orders server-side.
//
// One thing about the Conversions API is worth knowing before reading it: it
// answers 200 for a request it has entirely ignored. A payload with no usable
// identifiers is accepted, counted in events_received, and matched to nobody.
// So the interesting number in the response is not whether it succeeded; it is
// how many identifiers went with it, which is why that is tracked per order.

export type MetaPixel = {
  id: string;
  name: string;
  /** Unix seconds, from Meta. Null means it has never fired. */
  lastFiredAt: Date | null;
};

type PixelNode = {
  id: string;
  name?: string;
  last_fired_time?: string;
};

/** `act_123` or `123` — the pixel endpoints want the prefixed form. */
function actId(adAccountId: string): string {
  return adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
}

/**
 * Creates a pixel on the customer's ad account.
 *
 * Meta allows a limited number per ad account and refuses beyond it, so the
 * caller checks for an existing one first — creating a second pixel on an
 * account that already has a working one would split the customer's history
 * in two and make both halves look worse.
 */
export async function createMetaPixel(
  adAccountId: string,
  accessToken: string,
  name: string
): Promise<MetaPixel> {
  const res = await metaGraphRequest<{ id: string }>(`/${actId(adAccountId)}/adspixels`, {
    method: "POST",
    accessToken,
    params: { name },
  });
  return { id: res.id, name, lastFiredAt: null };
}

/** Every pixel already on the account, so an existing one can be adopted. */
export async function listMetaPixels(
  adAccountId: string,
  accessToken: string
): Promise<MetaPixel[]> {
  const res = await metaGraphRequest<{ data?: PixelNode[] }>(
    `/${actId(adAccountId)}/adspixels`,
    {
      accessToken,
      params: { fields: "id,name,last_fired_time", limit: 25 },
    }
  );
  return (res.data ?? []).map(toPixel);
}

/**
 * Asks Meta when this pixel last saw anything.
 *
 * This is the whole verification story. A pixel id in a snippet proves
 * nothing — the snippet may be on a page nobody reaches, blocked by a consent
 * banner, or pasted into a theme that was since replaced. last_fired_time is
 * Meta's own answer to whether events are arriving, and it is what the status
 * on the tracking page is built from.
 */
export async function fetchMetaPixel(
  pixelId: string,
  accessToken: string
): Promise<MetaPixel> {
  const res = await metaGraphRequest<PixelNode>(`/${pixelId}`, {
    accessToken,
    params: { fields: "id,name,last_fired_time" },
  });
  return toPixel(res);
}

function toPixel(node: PixelNode): MetaPixel {
  return {
    id: node.id,
    name: node.name ?? node.id,
    // Meta returns an ISO timestamp here despite the field's name.
    lastFiredAt: node.last_fired_time ? new Date(node.last_fired_time) : null,
  };
}

// --- the Conversions API ---------------------------------------------------

export type ServerEvent = {
  eventName: string;
  eventTime: Date;
  /** Must match the browser pixel's event id, or the sale counts twice. */
  eventId: string;
  valueCents: number;
  currency: string;
  hashedEmail?: string | null;
  hashedPhone?: string | null;
  country?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  /** Meta's click id, from the fbclid parameter on the landing page. */
  fbc?: string | null;
  /** Meta's browser id, from the _fbp cookie the pixel sets. */
  fbp?: string | null;
  /** Where the purchase happened. Meta requires it for web events. */
  sourceUrl?: string | null;
};

export type ConversionResult = {
  received: number;
  /** How many identifiers were sent. Low means poor attribution, not an error. */
  matchFields: number;
  /** Meta's warnings, which a 200 does not mean the absence of. */
  messages: string[];
};

/**
 * Sends orders to Meta server-side.
 *
 * `action_source: "website"` with an event_source_url, because these are web
 * purchases that MAIRO is relaying rather than in-person sales — telling Meta
 * otherwise puts them in a different attribution model and makes the numbers
 * disagree with the customer's own Ads Manager for reasons nobody can find.
 */
export async function sendMetaConversions(
  pixelId: string,
  accessToken: string,
  events: ServerEvent[],
  testEventCode?: string | null
): Promise<ConversionResult> {
  if (events.length === 0) return { received: 0, matchFields: 0, messages: [] };

  let matchFields = 0;

  const data = events.map((e) => {
    const userData: Record<string, unknown> = {};
    // Meta wants each hashed field as a one-element array.
    if (e.hashedEmail) userData.em = [e.hashedEmail];
    if (e.hashedPhone) userData.ph = [e.hashedPhone];
    if (e.country) userData.country = [e.country];
    // These two are sent unhashed, by Meta's spec — they are already opaque.
    if (e.clientIp) userData.client_ip_address = e.clientIp;
    if (e.userAgent) userData.client_user_agent = e.userAgent;
    if (e.fbc) userData.fbc = e.fbc;
    if (e.fbp) userData.fbp = e.fbp;

    matchFields = Math.max(matchFields, countMatchFields(userData));

    return {
      event_name: e.eventName,
      event_time: Math.floor(e.eventTime.getTime() / 1000),
      event_id: e.eventId,
      action_source: "website",
      ...(e.sourceUrl ? { event_source_url: e.sourceUrl } : {}),
      user_data: userData,
      custom_data: {
        // Meta takes whole currency units here, unlike the account node's
        // minor units. Sending cents would report a hundredfold revenue.
        value: Number((e.valueCents / 100).toFixed(2)),
        currency: e.currency.toUpperCase(),
      },
    };
  });

  const res = await metaGraphRequest<{
    events_received?: number;
    messages?: string[];
    fbtrace_id?: string;
  }>(`/${pixelId}/events`, {
    method: "POST",
    accessToken,
    params: {
      data: JSON.stringify(data),
      ...(testEventCode ? { test_event_code: testEventCode } : {}),
    },
  });

  return {
    received: res.events_received ?? 0,
    matchFields,
    messages: res.messages ?? [],
  };
}

/**
 * The browser half: the base code that goes on the customer's site.
 *
 * Emitted rather than documented because the two halves have to agree about
 * the event id, and a snippet copied off a help page will not. This one reads
 * the id the store puts on the thank-you page, so the browser's Purchase and
 * the one MAIRO relays are recognised as the same sale.
 */
export function metaPixelSnippet(pixelId: string): string {
  return `<!-- Meta pixel — added by MAIRO -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1"/></noscript>
<!-- End Meta pixel -->`;
}

/**
 * What goes on the order-confirmation page.
 *
 * The event id is the load-bearing part. Without it Meta counts the browser's
 * Purchase and MAIRO's relayed Purchase as two sales and the customer's ROAS
 * doubles overnight — which is the kind of wrong number somebody increases
 * their budget on.
 */
export function metaPurchaseSnippet(): string {
  return `<!-- Put this on the order-confirmation page only -->
<script>
fbq('track', 'Purchase', {
  value: ORDER_TOTAL,        // a number, e.g. 49.99 — not a string, no symbol
  currency: 'ORDER_CURRENCY' // e.g. 'USD'
}, {
  // Must be the same order id MAIRO receives, or the sale is counted twice.
  // Must produce the same string as MAIRO derives from the order id it
  // receives, so strip anything that isn't a letter, number, _ or -.
  eventID: 'mairo_' + String(ORDER_ID).replace(/[^A-Za-z0-9_-]/g, '')
});
</script>`;
}
