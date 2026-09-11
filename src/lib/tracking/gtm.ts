import type { ConversionAction, Niche } from "@/lib/tracking/niches";
import { metaPixelSnippet } from "@/lib/tracking/meta-pixel";
import { tiktokPixelSnippet } from "@/lib/tracking/tiktok-pixel";

// Builds a Google Tag Manager container the customer can import in one click.
//
// The problem this solves is the gap between "here is your pixel code" and a
// business actually measuring anything. Installing a pixel properly means a
// base tag on every page, a purchase tag on the confirmation page only, a
// click trigger on the phone number, a form trigger, and every one of them
// pointed at the right standard event for that kind of business. That is an
// afternoon's work for somebody who knows GTM and an impossibility for
// somebody who does not — which is every customer MAIRO has.
//
// GTM's Import Container takes a JSON file and creates all of it at once. So
// MAIRO generates that file, wired to this customer's own pixel ids and to the
// conversions their particular niche actually has. The import is one screen in
// GTM, and after it the business is measuring the right things without anybody
// touching their website's code again.
//
// The format is GTM's own export shape, version 2. It is undocumented in the
// sense that Google publishes no schema for it, and the constraints below were
// derived from what the importer accepts: every tag's firingTriggerId must name
// a trigger that exists in the same file, ids must be unique within their type,
// and account/container ids of "0" are the convention for a portable container
// that is not tied to the workspace it came from.

const ACCOUNT_ID = "0";
const CONTAINER_ID = "0";

type Parameter = {
  type: "template" | "boolean" | "list" | "map" | "integer";
  key?: string;
  value?: string;
  list?: Parameter[];
  map?: Parameter[];
};

type Trigger = {
  accountId: string;
  containerId: string;
  triggerId: string;
  name: string;
  type: string;
  filter?: { type: string; parameter: Parameter[] }[];
  customEventFilter?: { type: string; parameter: Parameter[] }[];
  autoEventFilter?: { type: string; parameter: Parameter[] }[];
  waitForTags?: Parameter;
  checkValidation?: Parameter;
  waitForTagsTimeout?: Parameter;
  uniqueTriggerId?: Parameter;
};

type Tag = {
  accountId: string;
  containerId: string;
  tagId: string;
  name: string;
  type: string;
  parameter: Parameter[];
  fingerprint: string;
  firingTriggerId: string[];
  tagFiringOption: string;
  monitoringMetadata?: { type: string };
};

type Variable = {
  accountId: string;
  containerId: string;
  variableId: string;
  name: string;
  type: string;
  parameter: Parameter[];
};

const template = (key: string, value: string): Parameter => ({
  type: "template",
  key,
  value,
});

const boolean = (key: string, value: boolean): Parameter => ({
  type: "boolean",
  key,
  value: String(value),
});

export type ContainerInput = {
  businessName: string;
  niche: Niche;
  metaPixelId: string | null;
  tiktokPixelId: string | null;
};

/**
 * The dataLayer variables the tags read.
 *
 * Two only, and both optional. A conversion with no value still fires — it
 * just reports no money, which is correct for a phone call and honest for a
 * booking. Inventing a default value here would push made-up revenue into the
 * customer's ROAS.
 */
function buildVariables(): Variable[] {
  return [
    {
      accountId: ACCOUNT_ID,
      containerId: CONTAINER_ID,
      variableId: "1",
      name: "MAIRO - Order value",
      type: "v",
      parameter: [
        { type: "integer", key: "dataLayerVersion", value: "2" },
        boolean("setDefaultValue", false),
        template("name", "value"),
      ],
    },
    {
      accountId: ACCOUNT_ID,
      containerId: CONTAINER_ID,
      variableId: "2",
      name: "MAIRO - Currency",
      type: "v",
      parameter: [
        { type: "integer", key: "dataLayerVersion", value: "2" },
        boolean("setDefaultValue", true),
        template("defaultValue", "USD"),
        template("name", "currency"),
      ],
    },
    {
      accountId: ACCOUNT_ID,
      containerId: CONTAINER_ID,
      variableId: "3",
      name: "MAIRO - Order id",
      type: "v",
      parameter: [
        { type: "integer", key: "dataLayerVersion", value: "2" },
        boolean("setDefaultValue", false),
        // Feeds the event id that stops a sale being counted twice — the
        // browser's copy and MAIRO's server-side copy have to agree, and this
        // is where the browser's half gets the order id from.
        template("name", "order_id"),
      ],
    },
  ];
}

/** The trigger that recognises one conversion action in the browser. */
function buildTrigger(action: ConversionAction, triggerId: string): Trigger {
  const base = {
    accountId: ACCOUNT_ID,
    containerId: CONTAINER_ID,
    triggerId,
    name: `MAIRO - ${action.label}`,
  };

  switch (action.detection) {
    case "url_contains":
      return {
        ...base,
        type: "pageview",
        filter: [
          {
            type: "contains",
            parameter: [
              template("arg0", "{{Page URL}}"),
              template("arg1", action.match ?? "/thank-you"),
            ],
          },
        ],
      };

    case "form_submit":
      return {
        ...base,
        type: "formSubmission",
        // checkValidation off on purpose: with it on, GTM waits to see whether
        // the form passed validation, and a single-page form that never
        // navigates therefore never fires. Off, it fires on submit — which
        // over-counts slightly on forms that fail validation, and that is the
        // better error. A missing conversion is invisible; an extra one shows
        // up as a gap against the real orders and gets investigated.
        checkValidation: { type: "boolean", value: "false" },
        waitForTags: { type: "boolean", value: "false" },
        waitForTagsTimeout: { type: "template", value: "2000" },
        uniqueTriggerId: { type: "template", value: `${triggerId}_form` },
      };

    case "phone_click":
      return {
        ...base,
        type: "linkClick",
        waitForTags: { type: "boolean", value: "false" },
        checkValidation: { type: "boolean", value: "false" },
        waitForTagsTimeout: { type: "template", value: "2000" },
        uniqueTriggerId: { type: "template", value: `${triggerId}_tel` },
        filter: [
          {
            type: "startsWith",
            parameter: [template("arg0", "{{Click URL}}"), template("arg1", "tel:")],
          },
        ],
      };

    case "email_click":
      return {
        ...base,
        type: "linkClick",
        waitForTags: { type: "boolean", value: "false" },
        checkValidation: { type: "boolean", value: "false" },
        waitForTagsTimeout: { type: "template", value: "2000" },
        uniqueTriggerId: { type: "template", value: `${triggerId}_mail` },
        filter: [
          {
            type: "startsWith",
            parameter: [template("arg0", "{{Click URL}}"), template("arg1", "mailto:")],
          },
        ],
      };

    case "click_selector":
      return {
        ...base,
        type: "click",
        filter: [
          {
            type: "cssSelector",
            parameter: [
              template("arg0", "{{Click Element}}"),
              template("arg1", action.match ?? "a"),
            ],
          },
        ],
      };

    case "datalayer_event":
      return {
        ...base,
        type: "customEvent",
        customEventFilter: [
          {
            type: "equals",
            parameter: [template("arg0", "{{_event}}"), template("arg1", action.id)],
          },
        ],
      };
  }
}

/**
 * The Custom HTML tag that fires one event on one network.
 *
 * Custom HTML rather than GTM's built-in Meta template, because the built-in
 * one cannot set the event id — and without a matching event id, the browser's
 * copy of a sale and the one MAIRO relays server-side are counted as two
 * sales. A doubled ROAS is the one wrong number a customer acts on.
 */
function eventTagHtml(
  platform: "META" | "TIKTOK",
  action: ConversionAction
): string {
  const value = action.hasValue
    ? `,{value: {{MAIRO - Order value}}, currency: '{{MAIRO - Currency}}'}`
    : ",{}";

  if (platform === "META") {
    return `<script>
  // ${action.label} → Meta ${action.metaEvent}. Added by MAIRO.
  (function () {
    if (typeof fbq !== 'function') return;
    var id = {{MAIRO - Order id}};
    var opts = id ? { eventID: 'mairo_' + String(id).replace(/[^A-Za-z0-9_-]/g, '') } : {};
    fbq('track', '${action.metaEvent}'${value}, opts);
  })();
</script>`;
  }

  return `<script>
  // ${action.label} → TikTok ${action.tiktokEvent}. Added by MAIRO.
  (function () {
    if (typeof ttq === 'undefined') return;
    var id = {{MAIRO - Order id}};
    var opts = id ? { event_id: 'mairo_' + String(id).replace(/[^A-Za-z0-9_-]/g, '') } : {};
    ttq.track('${action.tiktokEvent}'${value}, opts);
  })();
</script>`;
}

function htmlTag(
  tagId: string,
  name: string,
  html: string,
  firingTriggerId: string[]
): Tag {
  return {
    accountId: ACCOUNT_ID,
    containerId: CONTAINER_ID,
    tagId,
    name,
    type: "html",
    parameter: [boolean("supportDocumentWrite", false), template("html", html)],
    fingerprint: "0",
    firingTriggerId,
    tagFiringOption: "oncePerEvent",
    monitoringMetadata: { type: "map" },
  };
}

/** GTM's own id for "All Pages", which every container has. */
const ALL_PAGES_TRIGGER = "2147479553";

export type GtmContainer = Record<string, unknown>;

/**
 * The whole container: base pixels, one tag per network per conversion, and
 * the triggers that fire them.
 *
 * Ordering matters at runtime and is handled by GTM rather than here: the base
 * pixel tags fire on All Pages, and an event tag on a thank-you page fires
 * after them in the same pageview because GTM evaluates All Pages first.
 */
export function buildContainer(input: ContainerInput): GtmContainer {
  const tags: Tag[] = [];
  const triggers: Trigger[] = [];
  const variables = buildVariables();

  let nextTagId = 1;
  let nextTriggerId = 1;

  // Base pixels, on every page. Without these the event tags have no fbq or
  // ttq to call and silently do nothing.
  if (input.metaPixelId) {
    tags.push(
      htmlTag(
        String(nextTagId++),
        "MAIRO - Meta pixel (all pages)",
        metaPixelSnippet(input.metaPixelId),
        [ALL_PAGES_TRIGGER]
      )
    );
  }
  if (input.tiktokPixelId) {
    tags.push(
      htmlTag(
        String(nextTagId++),
        "MAIRO - TikTok pixel (all pages)",
        tiktokPixelSnippet(input.tiktokPixelId),
        [ALL_PAGES_TRIGGER]
      )
    );
  }

  for (const action of input.niche.actions) {
    const triggerId = String(nextTriggerId++);
    triggers.push(buildTrigger(action, triggerId));

    if (input.metaPixelId) {
      tags.push(
        htmlTag(
          String(nextTagId++),
          `MAIRO - Meta ${action.metaEvent} (${action.label})`,
          eventTagHtml("META", action),
          [triggerId]
        )
      );
    }
    if (input.tiktokPixelId) {
      tags.push(
        htmlTag(
          String(nextTagId++),
          `MAIRO - TikTok ${action.tiktokEvent} (${action.label})`,
          eventTagHtml("TIKTOK", action),
          [triggerId]
        )
      );
    }
  }

  return {
    exportFormatVersion: 2,
    exportTime: new Date().toISOString(),
    containerVersion: {
      path: `accounts/${ACCOUNT_ID}/containers/${CONTAINER_ID}/versions/0`,
      accountId: ACCOUNT_ID,
      containerId: CONTAINER_ID,
      containerVersionId: "0",
      name: `MAIRO — ${input.businessName}`,
      description:
        `Conversion tracking for ${input.businessName}, set up by MAIRO for a ` +
        `${input.niche.label.toLowerCase()}. Import this into Google Tag Manager ` +
        `and publish. Do not edit the tag names — MAIRO uses them to tell what is installed.`,
      container: {
        path: `accounts/${ACCOUNT_ID}/containers/${CONTAINER_ID}`,
        accountId: ACCOUNT_ID,
        containerId: CONTAINER_ID,
        name: `MAIRO — ${input.businessName}`,
        publicId: "GTM-XXXXXXX",
        usageContext: ["WEB"],
        fingerprint: "0",
      },
      tag: tags,
      trigger: triggers,
      variable: variables,
      // The built-in variables the triggers reference. Without these declared,
      // GTM imports the triggers but they can never match — {{Click URL}}
      // resolves to nothing and the phone-tap trigger silently never fires.
      builtInVariable: [
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "PAGE_URL", name: "Page URL" },
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "PAGE_HOSTNAME", name: "Page Hostname" },
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "PAGE_PATH", name: "Page Path" },
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "CLICK_URL", name: "Click URL" },
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "CLICK_ELEMENT", name: "Click Element" },
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "CLICK_TEXT", name: "Click Text" },
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "FORM_ELEMENT", name: "Form Element" },
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "EVENT", name: "Event" },
      ],
      fingerprint: "0",
    },
  };
}

/**
 * The dataLayer lines a shop puts on its confirmation page.
 *
 * Only needed where a conversion carries money or an order id — a phone tap
 * needs nothing at all, which is the point of detecting it by click. Kept to
 * three lines because anything longer does not get pasted.
 */
export function dataLayerSnippet(niche: Niche): string | null {
  const valued = niche.actions.filter((a) => a.hasValue);
  if (valued.length === 0) return null;

  return `<!-- Put this on your order-confirmation page, ABOVE the GTM snippet -->
<script>
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    value: ORDER_TOTAL,        // a number, e.g. 49.99 — no currency symbol
    currency: 'ORDER_CURRENCY',// e.g. 'USD'
    order_id: 'ORDER_ID'       // your shop's own order number
  });
</script>`;
}

/** GTM's own container snippet, for a business that has no GTM yet. */
export function gtmSnippet(containerId: string): string {
  const id = containerId.trim().toUpperCase();
  return `<!-- Google Tag Manager — paste immediately after <head> -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${id}');</script>

<!-- And this immediately after <body> -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${id}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;
}

/** A GTM container id, as the customer would paste it. */
export function isGtmContainerId(value: string): boolean {
  return /^GTM-[A-Z0-9]{4,10}$/.test(value.trim().toUpperCase());
}
