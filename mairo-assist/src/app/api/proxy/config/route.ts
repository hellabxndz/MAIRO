import { NextResponse, type NextRequest } from "next/server";
import { storefrontContext, widgetConfig } from "@/lib/widget/service";

/** Widget settings for a storefront (via Shopify's signed App Proxy). */
export async function GET(request: NextRequest) {
  const ctx = await storefrontContext(request);
  if (!ctx) return NextResponse.json({ enabled: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(await widgetConfig(ctx.businessId), { headers: { "Cache-Control": "no-store" } });
}
