import { z } from "zod";

export const INDUSTRIES = [
  "Apparel & fashion",
  "Beauty & personal care",
  "Home & living",
  "Electronics",
  "Health & wellness",
  "Food & beverage",
  "Sports & outdoors",
  "Jewelry & accessories",
  "Toys & kids",
  "Pets",
  "Art & crafts",
  "Other",
] as const;

export const SELLS = [
  { value: "physical", label: "Physical products", hint: "Clothing, goods, anything you ship" },
  { value: "digital", label: "Digital products", hint: "Downloads, courses, software" },
  { value: "services", label: "Services", hint: "Appointments, consulting, subscriptions" },
  { value: "other", label: "Other", hint: "Something else" },
] as const;

export const AI_GOALS = [
  { value: "customer_support", label: "Customer support", hint: "Answer questions about policies, shipping and products" },
  { value: "sales_assistance", label: "Sales assistance", hint: "Help shoppers choose and buy" },
  { value: "product_recommendations", label: "Product recommendations", hint: "Suggest products that fit what they want" },
  { value: "order_tracking", label: "Order tracking", hint: "Securely share order and shipping status" },
  { value: "returns_exchanges", label: "Returns and exchanges", hint: "Collect requests for your approval" },
  { value: "lead_collection", label: "Customer lead collection", hint: "Capture interested shoppers for follow-up" },
] as const;

export const AI_NAME_SUGGESTIONS = ["Alex", "Nova", "Assistant"] as const;

const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .transform((v) => (v === "" ? undefined : /^https?:\/\//i.test(v) ? v : `https://${v}`))
  .pipe(z.url({ protocol: /^https?$/, message: "Enter a valid website address" }).optional());

export const businessInfoSchema = z.object({
  name: z.string().trim().min(1, "Enter your business name").max(120),
  websiteUrl: optionalUrl,
  industry: z.enum(INDUSTRIES, { message: "Choose an industry" }),
  description: z.string().trim().max(2000).optional().default(""),
});

export const sellsSchema = z.object({
  sells: z
    .array(z.enum(["physical", "digital", "services", "other"]))
    .min(1, "Choose at least one")
    .transform((v) => [...new Set(v)]),
});

export const goalsSchema = z.object({
  goals: z
    .array(
      z.enum([
        "customer_support",
        "sales_assistance",
        "product_recommendations",
        "order_tracking",
        "returns_exchanges",
        "lead_collection",
      ]),
    )
    .min(1, "Choose at least one")
    .transform((v) => [...new Set(v)]),
});

export const aiNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give your AI employee a name")
    .max(40, "Keep it under 40 characters")
    .regex(/^[\p{L}\p{N} .'-]+$/u, "Use letters, numbers, spaces, dots, apostrophes or dashes"),
});

const policyText = z.string().trim().max(20000, "Keep this under 20,000 characters").optional().default("");

export const policiesSchema = z.object({
  shipping: policyText,
  returns: policyText,
  refunds: policyText,
  instructions: z.string().trim().max(4000, "Keep instructions under 4,000 characters").optional().default(""),
});
