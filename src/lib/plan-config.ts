import { db } from "@/lib/db";
import { ALL_PLANS } from "@/lib/plans";
import { DEFAULT_ENTITLEMENTS } from "@/lib/entitlements";

// Puts the compiled-in plans into the database, once.
//
// The point of PlanConfig is that pricing can be changed without a deploy. The
// point of THIS is that a deployment which has never been seeded still works —
// entitlements.ts falls back to the code, so an empty table is a valid state
// rather than a broken one, and this exists to give an operator a starting set
// of rows to edit rather than making them write JSON by hand.
//
// It only ever inserts. Running it again after someone has edited a price in
// the database leaves that edit alone, because the whole reason the table
// exists is to be the thing that overrides the code — a seed that overwrote it
// on every deploy would defeat itself.

export async function seedPlanConfig(): Promise<{ created: string[]; skipped: string[] }> {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const [index, plan] of ALL_PLANS.entries()) {
    const existing = await db.planConfig.findUnique({ where: { tier: plan.tier } });
    if (existing) {
      skipped.push(plan.tier);
      continue;
    }

    await db.planConfig.create({
      data: {
        tier: plan.tier,
        name: plan.name,
        // Stored in cents, like every other amount in the schema. A float
        // column for money is how you end up charging $98.99999999.
        priceMonthly: Math.round(plan.priceMonthly * 100),
        tagline: plan.tagline,
        spendGuidance: plan.spendGuidance,
        featured: plan.featured ?? false,
        active: true,
        sortOrder: index,
        featuresJson: JSON.stringify(plan.features),
        entitlementsJson: JSON.stringify(DEFAULT_ENTITLEMENTS[plan.tier]),
      },
    });
    created.push(plan.tier);
  }

  return { created, skipped };
}
