// Checks that plan permissions resolve the way the pricing page promises.
//
// Needs a database. Point DATABASE_URL at a scratch one and run:
//   npm run check:entitlements
//
// The cases that matter are the override ones. PlanConfig exists so pricing
// can change without a deploy, which means a row in it can be wrong, partial,
// or malformed — and none of those may take the product down or silently
// switch a paid feature off for everyone.

import { db } from "@/lib/db";
import { seedPlanConfig } from "@/lib/plan-config";
import { entitlementsForTier, checkPlatformSelection, entitlementsFor } from "@/lib/entitlements";
import { planFor } from "@/lib/plans";

// The top plan, named from plans.ts. These labels used to say "Pro"; the
// plan was renamed to Scale and every hard-coded mention had to be hunted
// down, which is the thing this avoids next time.
const TOP = planFor("SCALE");

let bad = 0;
async function main() {
  const ok = (n: string, c: boolean, x = "") => { if (!c) { bad++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n}`); };

  console.log("\n— seeding —");
  const first = await seedPlanConfig();
  console.log(`  created: ${first.created.join(", ")}`);
  const second = await seedPlanConfig();
  ok("re-seeding creates nothing", second.created.length === 0, JSON.stringify(second.created));

  console.log("\n— defaults from the database —");
  const starter = await entitlementsForTier("STARTER");
  const growth = await entitlementsForTier("GROWTH");
  const scale = await entitlementsForTier("SCALE");

  ok("every plan runs Meta", starter.meta_ads && growth.meta_ads && scale.meta_ads);
  ok("Starter: 3 campaigns", starter.campaign_limit === 3, `${starter.campaign_limit}`);
  ok("Starter: you approve everything (no auto optimize)", !starter.auto_optimize && !starter.autopilot);
  ok("Starter: basic analytics", !starter.advanced_analytics);
  ok("Starter: no posting", !starter.social_posting);

  ok("Growth: 15 campaigns", growth.campaign_limit === 15, `${growth.campaign_limit}`);
  ok("Growth: Assisted automation", growth.auto_optimize && !growth.autopilot);
  ok("Growth: advanced analytics", growth.advanced_analytics);
  ok("Growth: no posting", !growth.social_posting);

  ok(`${TOP.name}: unlimited campaigns`, !Number.isFinite(scale.campaign_limit), `${scale.campaign_limit}`);
  ok(`${TOP.name}: Autopilot`, scale.auto_optimize && scale.autopilot);
  ok(`${TOP.name}: posts to Instagram`, scale.social_posting);

  // The whole point of three plans: each step up buys something real.
  ok("each plan gives more image credits than the last",
    starter.studio_credits_monthly < growth.studio_credits_monthly &&
      growth.studio_credits_monthly < scale.studio_credits_monthly);
  ok("each plan costs more than the last",
    planFor("STARTER").priceMonthly < planFor("GROWTH").priceMonthly &&
      planFor("GROWTH").priceMonthly < TOP.priceMonthly);

  console.log("\n— a database edit overrides the code —");
  await db.planConfig.update({
    where: { tier: "STARTER" },
    data: { entitlementsJson: JSON.stringify({ auto_optimize: true, campaign_limit: 42 }) },
  });
  const edited = await entitlementsForTier("STARTER");
  ok("edited flag takes effect", edited.auto_optimize === true);
  ok("edited number takes effect", edited.campaign_limit === 42, `${edited.campaign_limit}`);
  ok("flags absent from the row keep their compiled value", edited.meta_ads === true && edited.autopilot === false);
  await db.planConfig.update({
    where: { tier: "STARTER" },
    data: { entitlementsJson: JSON.stringify({}) },
  });
  const reverted = await entitlementsForTier("STARTER");
  ok("an empty override falls back cleanly", reverted.campaign_limit === 3 && !reverted.auto_optimize);

  console.log("\n— a malformed row can't break the product —");
  await db.planConfig.update({ where: { tier: "STARTER" }, data: { entitlementsJson: "{not json" } });
  const broken = await entitlementsForTier("STARTER");
  ok("garbage JSON falls back to the code", broken.campaign_limit === 3 && broken.meta_ads);
  await db.planConfig.update({
    where: { tier: "STARTER" },
    data: { entitlementsJson: JSON.stringify({}) },
  });

  console.log("\n— platform selection —");
  ok("Meta is allowed on Starter", checkPlatformSelection(["META"], reverted).allowed);
  // TikTok was retired. Even a plan edited to switch everything on can't
  // launch there, because there's no adapter behind it.
  ok("TikTok is refused on every plan", !checkPlatformSelection(["TIKTOK"], scale).allowed);
  ok("so is Meta + TikTok", !checkPlatformSelection(["META", "TIKTOK"], scale).allowed);

  console.log("\n— resolving from an organization —");
  // An organization that doesn't exist resolves as no plan at all, which
  // must still give a working set of permissions rather than throwing.
  const unknown = await entitlementsFor("org_does_not_exist");
  const none = await entitlementsForTier("NONE");
  ok("an unknown organization resolves as no plan", JSON.stringify(unknown) === JSON.stringify(none));

  console.log(bad === 0 ? "\nAll checks passed.\n" : `\n${bad} FAILED\n`);


}

main().finally(async () => {
  await db.$disconnect();
  process.exit(bad === 0 ? 0 : 1);
});
