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
  ok("Starter: Meta yes, TikTok no", starter.meta_ads && !starter.tiktok_ads);
  ok("Starter: no cross-platform", !starter.cross_platform_campaigns);
  ok("Starter: no auto optimize", !starter.auto_optimize);
  ok("Starter: 1 campaign", starter.campaign_limit === 1, `${starter.campaign_limit}`);

  const growth = await entitlementsForTier("GROWTH");
  ok("Growth: TikTok yes", growth.tiktok_ads);
  ok("Growth: cross-platform yes", growth.cross_platform_campaigns);
  ok("Growth: growth mode yes", growth.tiktok_growth);
  ok("Growth: auto optimize NO", !growth.auto_optimize);

  const pro = await entitlementsForTier("SCALE");
  ok("Pro: auto optimize yes", pro.auto_optimize);
  ok("Pro: 10 campaigns", pro.campaign_limit === 10);

  console.log("\n— a database edit overrides the code —");
  await db.planConfig.update({
    where: { tier: "STARTER" },
    data: { entitlementsJson: JSON.stringify({ tiktok_ads: true, campaign_limit: 42 }) },
  });
  const edited = await entitlementsForTier("STARTER");
  ok("edited flag takes effect", edited.tiktok_ads === true);
  ok("edited number takes effect", edited.campaign_limit === 42, `${edited.campaign_limit}`);
  ok("flags absent from the row keep their compiled value", edited.meta_ads === true && edited.auto_optimize === false);
  await db.planConfig.update({
    where: { tier: "STARTER" },
    data: { entitlementsJson: JSON.stringify({}) },
  });
  const reverted = await entitlementsForTier("STARTER");
  ok("an empty override falls back cleanly", reverted.campaign_limit === 1 && !reverted.tiktok_ads);

  console.log("\n— a malformed row can't break the product —");
  await db.planConfig.update({ where: { tier: "STARTER" }, data: { entitlementsJson: "{not json" } });
  const broken = await entitlementsForTier("STARTER");
  ok("garbage JSON falls back to the code", broken.campaign_limit === 1 && broken.meta_ads);
  await db.planConfig.update({
    where: { tier: "STARTER" },
    data: { entitlementsJson: JSON.stringify({}) },
  });

  console.log("\n— platform selection —");
  ok("Starter picking TikTok is blocked, naming the flag",
    checkPlatformSelection(["TIKTOK"], reverted).allowed === false);
  const sel = checkPlatformSelection(["TIKTOK"], reverted);
  ok("and the missing flag is tiktok_ads", !sel.allowed && sel.missing === "tiktok_ads");
  ok("Starter picking Meta is fine", checkPlatformSelection(["META"], reverted).allowed);
  ok("Growth picking both is fine", checkPlatformSelection(["META","TIKTOK"], growth).allowed);

  console.log("\n— resolving from an organization —");
  const orgEnt = await entitlementsFor("org_a");   // GROWTH in the seeded data
  ok("org_a (Growth) gets TikTok", orgEnt.tiktok_ads);
  const orgB = await entitlementsFor("org_b");     // STARTER
  ok("org_b (Starter) does not", !orgB.tiktok_ads);

  console.log(bad === 0 ? "\nAll checks passed.\n" : `\n${bad} FAILED\n`);


}

main().finally(async () => {
  await db.$disconnect();
  process.exit(bad === 0 ? 0 : 1);
});
