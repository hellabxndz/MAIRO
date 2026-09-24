import { z } from "zod";
import type { ToolSpec } from "./tool-spec";

/*
 * Tool catalog. Each tool: a strict input schema, a description the model
 * reads, and (in tools-server.ts) an executor that checks tenant and customer
 * authorization and writes an audit row. None of these tools can change an
 * order, issue money, or read another business's data: the business ID
 * always comes from the server context, never from the model.
 */

export const POLICY_TOPICS = ["shipping", "returns", "refunds", "sizing", "faq", "contact", "hours", "company"] as const;

export const searchKnowledge = {
  name: "search_knowledge",
  description:
    "Search the business's knowledge base (policies, FAQs, sizing guides, company info) for passages relevant to the customer's question. Use before answering any question about policies or the business.",
  schema: z.object({ query: z.string().min(2).max(200).describe("Search words, e.g. 'return window' or 'international shipping'") }).strict(),
} satisfies ToolSpec;

export const getBusinessPolicy = {
  name: "get_business_policy",
  description: "Get the business's written policy on a topic. Returns nothing if the business hasn't written one.",
  schema: z.object({ topic: z.enum(POLICY_TOPICS) }).strict(),
} satisfies ToolSpec;

export const escalateToHuman = {
  name: "escalate_to_human",
  description:
    "Hand the conversation to the business's team. Use when the customer asks for a person, is upset, or needs something you can't do. After this you stop replying; a person will continue.",
  schema: z.object({ reason: z.string().min(3).max(300).describe("Short reason for the team, without personal data") }).strict(),
} satisfies ToolSpec;

export const captureLead = {
  name: "capture_lead",
  description:
    "Save a shopper's contact details for the team to follow up, ONLY when the shopper has voluntarily given their email and asked to be contacted or notified. This does not sign them up for marketing.",
  schema: z
    .object({
      email: z.email().max(320),
      name: z.string().max(120).nullable(),
      interest: z.string().max(500).describe("What they're interested in"),
    })
    .strict(),
} satisfies ToolSpec;

export const searchProducts = {
  name: "search_products",
  description:
    "Search the store's synced product catalog. Use for any question about what the store sells, product recommendations, or prices. Only recommend products this returns.",
  schema: z
    .object({
      query: z.string().min(2).max(200).describe("What the customer is looking for, e.g. 'waterproof hiking boots'"),
      max_price: z.number().positive().nullable().describe("Upper price limit if the customer gave one, else null"),
    })
    .strict(),
} satisfies ToolSpec;

export const getProductDetails = {
  name: "get_product_details",
  description: "Get full details for one product from search_products: description, options (sizes, colors), variants and prices.",
  schema: z.object({ product_id: z.uuid().describe("The product_id from search_products") }).strict(),
} satisfies ToolSpec;

export const checkAvailability = {
  name: "check_availability",
  description:
    "Check whether a product (optionally a specific variant such as a size or color) can be bought right now. Checks the store live when possible. Never state stock without calling this.",
  schema: z
    .object({
      product_id: z.uuid().describe("The product_id from search_products"),
      variant: z.string().max(200).nullable().describe("Variant wording the customer used, e.g. 'medium blue', or null for all variants"),
    })
    .strict(),
} satisfies ToolSpec;

export const PRODUCT_TOOL_NAMES = [searchProducts.name, getProductDetails.name, checkAvailability.name] as const;

export const ALL_TOOLS = [searchKnowledge, getBusinessPolicy, escalateToHuman, captureLead, searchProducts, getProductDetails, checkAvailability] as const;
export type ToolName = (typeof ALL_TOOLS)[number]["name"];

/** Map a policy topic to knowledge-base categories. */
export const POLICY_CATEGORIES: Record<(typeof POLICY_TOPICS)[number], string[]> = {
  shipping: ["shipping_policy"],
  returns: ["return_policy"],
  refunds: ["refund_policy"],
  sizing: ["sizing_guide"],
  faq: ["faq"],
  contact: ["contact_info"],
  hours: ["business_hours"],
  company: ["company_background"],
};
