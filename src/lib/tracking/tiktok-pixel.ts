import { tiktokRequest } from "@/lib/ad-platforms/tiktok/client";
import { countMatchFields } from "@/lib/tracking/hash";

// TikTok's pixel, and its Events API.
//
// The shape mirrors the Meta module next door on purpose, but three of the
// details underneath are different in ways that fail quietly:
//
// TikTok's Events API takes hashed identifiers as bare strings, where Meta
// takes one-element arrays. Sending Meta's shape here is accepted and matches
// nobody.
//
// It takes money as a number in whole currency units and a separate currency
// code, like Meta — but it wants `event_time` as a Unix *second* in a string
// field, and rejects a number in some versions. It is stringified here.
//
// And pixel "activity" is not a timestamp on the pixel node the way Meta's
// last_fired_time is. TikTok reports it as a status on the pixel list, so
// "has this ever fired" is read from a different shape and normalized to the
// same answer for the UI.

const EVENTS_PATH = "/event/track/";

export type TikTokPixel = {
  id: string;
  name: string;
  lastFiredAt: Date | null;
  /** TikTok's own word for whether it is receiving events. */
  active: boolean;
};

type PixelRow = {
  pixel_id?: string;
  pixel_code?: string;
  pixel_name?: string;
  /** TikTok returns seconds. Absent on a pixel that has never fired. */
  last_fired_time?: number | string;
  pixel_status?: string;
  status?: string;
};

function toPixel(row: PixelRow): TikTokPixel {
  const fired = row.last_fired_time;
  const seconds = typeof fired === "string" ? Number(fired) : fired;
  const status = (row.pixel_status ?? row.status ?? "").toUpperCase();

  return {
    // TikTok calls it pixel_code in the snippet and pixel_id in the API, and
    // both appear in responses depending on the endpoint.
    id: row.pixel_code ?? row.pixel_id ?? "",
    name: row.pixel_name ?? row.pixel_code ?? row.pixel_id ?? "",
    lastFiredAt: seconds && Number.isFinite(seconds) ? new Date(seconds * 1000) : null,
    active: status.includes("ACTIVE") || Boolean(seconds),
  };
}

/**
 * Creates a pixel on the advertiser account.
 *
 * `pixel_mode: 1` is standard mode — the pixel plus manually placed events.
 * Developer mode (2) requires the advertiser to wire events themselves and is
 * the wrong default for a business that does not know what a pixel is.
 */
export async function createTikTokPixel(
  advertiserId: string,
  accessToken: string,
  name: string
): Promise<TikTokPixel> {
  const res = await tiktokRequest<PixelRow>("/pixel/create/", {
    method: "POST",
    accessToken,
    body: {
      advertiser_id: advertiserId,
      pixel_name: name,
      pixel_mode: 1,
    },
  });
  return { ...toPixel(res), name };
}

export async function listTikTokPixels(
  advertiserId: string,
  accessToken: string
): Promise<TikTokPixel[]> {
  const res = await tiktokRequest<{ pixels?: PixelRow[] }>("/pixel/list/", {
    accessToken,
    params: { advertiser_id: advertiserId, page_size: 50 },
  });
  return (res.pixels ?? []).map(toPixel).filter((p) => p.id.length > 0);
}

/** One pixel's current state, for the "is it actually working" check. */
export async function fetchTikTokPixel(
  advertiserId: string,
  accessToken: string,
  pixelId: string
): Promise<TikTokPixel | null> {
  const res = await tiktokRequest<{ pixels?: PixelRow[] }>("/pixel/list/", {
    accessToken,
    params: {
      advertiser_id: advertiserId,
      pixel_code: pixelId,
      page_size: 10,
    },
  });
  const match = (res.pixels ?? []).map(toPixel).find((p) => p.id === pixelId);
  return match ?? null;
}

// --- the Events API --------------------------------------------------------

export type TikTokServerEvent = {
  eventName: string;
  eventTime: Date;
  /** Must match the browser pixel's event_id or the sale counts twice. */
  eventId: string;
  valueCents: number;
  currency: string;
  hashedEmail?: string | null;
  hashedPhone?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  /** TikTok's click id, from the ttclid parameter on the landing page. */
  ttclid?: string | null;
  sourceUrl?: string | null;
};

export type TikTokConversionResult = {
  received: number;
  matchFields: number;
  messages: string[];
};

/**
 * Sends orders to TikTok server-side.
 *
 * Events API 2.0, which batches — TikTok takes up to 1000 in a call and the
 * caller batches well under that. `event_source: "web"` with a source id is
 * the pixel-equivalent path; offline and app have their own source types and
 * different attribution, so mislabelling these would make the numbers
 * disagree with TikTok Ads Manager for no discoverable reason.
 */
export async function sendTikTokConversions(
  pixelId: string,
  accessToken: string,
  events: TikTokServerEvent[],
  testEventCode?: string | null
): Promise<TikTokConversionResult> {
  if (events.length === 0) return { received: 0, matchFields: 0, messages: [] };

  let matchFields = 0;

  const data = events.map((e) => {
    // Bare strings, not arrays. This is the difference from Meta that fails
    // silently — a wrong shape here is accepted and matched to nobody.
    const user: Record<string, unknown> = {};
    if (e.hashedEmail) user.email = e.hashedEmail;
    if (e.hashedPhone) user.phone = e.hashedPhone;
    if (e.clientIp) user.ip = e.clientIp;
    if (e.userAgent) user.user_agent = e.userAgent;
    if (e.ttclid) user.ttclid = e.ttclid;

    matchFields = Math.max(matchFields, countMatchFields(user));

    return {
      event: e.eventName,
      event_time: Math.floor(e.eventTime.getTime() / 1000),
      event_id: e.eventId,
      user,
      properties: {
        // Whole currency units, like Meta. Cents here would be a hundredfold
        // revenue error in the customer's ROAS.
        value: Number((e.valueCents / 100).toFixed(2)),
        currency: e.currency.toUpperCase(),
      },
      page: e.sourceUrl ? { url: e.sourceUrl } : undefined,
    };
  });

  const res = await tiktokRequest<Record<string, unknown>>(EVENTS_PATH, {
    method: "POST",
    accessToken,
    body: {
      event_source: "web",
      event_source_id: pixelId,
      ...(testEventCode ? { test_event_code: testEventCode } : {}),
      data,
    },
  });

  // A zero code means TikTok took the batch. It does not report a per-event
  // count the way Meta does, so the count sent is the count accepted.
  return {
    received: events.length,
    matchFields,
    messages: typeof res?.message === "string" ? [res.message as string] : [],
  };
}

/** The base code for the customer's site. */
export function tiktokPixelSnippet(pixelId: string): string {
  return `<!-- TikTok pixel — added by MAIRO -->
<script>
!function (w, d, t) { w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";
ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript";
o.async=!0;o.src=r+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];
a.parentNode.insertBefore(o,a)};
ttq.load('${pixelId}');
ttq.page();
}(window, document, 'ttq');
</script>
<!-- End TikTok pixel -->`;
}

/** What goes on the order-confirmation page. */
export function tiktokPurchaseSnippet(): string {
  return `<!-- Put this on the order-confirmation page only -->
<script>
ttq.track('CompletePayment', {
  value: ORDER_TOTAL,         // a number, e.g. 49.99
  currency: 'ORDER_CURRENCY'  // e.g. 'USD'
}, {
  // The same string MAIRO derives from the order id it receives, so the
  // browser's sale and the one MAIRO relays are recognised as one sale.
  event_id: 'mairo_' + String(ORDER_ID).replace(/[^A-Za-z0-9_-]/g, '')
});
</script>`;
}
