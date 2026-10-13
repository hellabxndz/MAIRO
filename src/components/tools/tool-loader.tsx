"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

// Loads only the tool on this page. next/dynamic splits code from a Client
// Component (not from a Server Component), so each tool page ships its own
// calculator instead of all fifteen. Still rendered on the server.

type Props = { plans: { id: string; name: string; price: number }[]; toolNames: Record<string, string> };

const TOOLS: Record<string, ComponentType<Props>> = {
  "break-even-roas": dynamic(() => import("./break-even-roas").then((m) => m.BreakEvenRoasTool)),
  "margin-markup": dynamic(() => import("./margin-markup").then((m) => m.MarginMarkupTool)),
  "ad-roi": dynamic(() => import("./ad-roi").then((m) => m.AdRoiTool)),
  "customer-lifetime-value": dynamic(() => import("./customer-lifetime-value").then((m) => m.LifetimeTool)),
  "monthly-profit": dynamic(() => import("./monthly-profit").then((m) => m.MonthlyProfitTool)),
  "service-lead-economics": dynamic(() => import("./service-lead-economics").then((m) => m.ServiceLeadEconomicsTool)),
  "budget-planner": dynamic(() => import("./budget-planner").then((m) => m.BudgetPlannerTool)),
  "shopify-fees": dynamic(() => import("./shopify-fees").then((m) => m.ShopifyFeesTool)),
  "hook-generator": dynamic(() => import("./hook-generator").then((m) => m.HookGeneratorTool)),
  "creative-brief": dynamic(() => import("./creative-brief").then((m) => m.CreativeBriefTool)),
  "offer-clarity": dynamic(() => import("./offer-clarity").then((m) => m.OfferClarityTool)),
  "ad-examples": dynamic(() => import("./ad-examples").then((m) => m.AdExamplesTool)),
  "offer-readiness": dynamic(() => import("./offer-readiness").then((m) => m.OfferReadinessTool)),
  "competitor-ads": dynamic(() => import("./competitor-ads").then((m) => m.CompetitorAdsTool)),
  "utm-builder": dynamic(() => import("./utm-builder").then((m) => m.UtmBuilderTool)),
};


export function ToolLoader({ slug, ...props }: Props & { slug: string }) {
  const Tool = TOOLS[slug];
  return Tool ? <Tool {...props} /> : null;
}
