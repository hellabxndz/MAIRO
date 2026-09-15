// Brings the PlanConfig table back in line with the plans in the code.
//
//   npm run plans:sync          # show what would change, change nothing
//   npm run plans:sync -- --write
//
// Why this is needed at all: PlanConfig exists so pricing can be changed
// without a deploy, and entitlements.ts prefers a row in it over the compiled
// plan. seedPlanConfig() deliberately only ever INSERTS — re-running it must
// not stamp on a price somebody edited in the database, because overriding the
// code is the entire point of the table.
//
// The cost of that is this: a deployment seeded when the top plan was "Pro" at
// $199 keeps serving "Pro" and "$199" on every screen that reads the database,
// however many times the code is corrected and redeployed. The landing page is
// unaffected — it renders the compiled PLANS — which makes the mismatch worse,
// because the marketing page and the in-app billing page then disagree.
//
// So this is the deliberate, run-it-yourself counterpart to the seeder. It
// prints a diff and does nothing unless asked, because a script that silently
// rewrites production pricing is exactly what the seeder was careful not to be.

import { ALL_PLANS } from "@/lib/plans";
import { DEFAULT_ENTITLEMENTS } from "@/lib/entitlements";
import { db } from "@/lib/db";

const write = process.argv.includes("--write");

type Change = { tier: string; field: string; from: string; to: string };

async function main() {
  const changes: Change[] = [];
  const missing: string[] = [];

  for (const [index, plan] of ALL_PLANS.entries()) {
    const row = await db.planConfig.findUnique({ where: { tier: plan.tier } });

    if (!row) {
      // Nothing to reconcile: entitlements.ts already falls back to the code
      // for a tier with no row, so this is a correct state, not a problem.
      missing.push(plan.tier);
      continue;
    }

    const wantCents = Math.round(plan.priceMonthly * 100);
    const wantFeatures = JSON.stringify(plan.features);
    const wantEntitlements = JSON.stringify(DEFAULT_ENTITLEMENTS[plan.tier]);

    const diffs: Change[] = [];
    const note = (field: string, from: unknown, to: unknown) => {
      if (String(from) !== String(to)) {
        diffs.push({ tier: plan.tier, field, from: String(from), to: String(to) });
      }
    };

    note("name", row.name, plan.name);
    note("priceMonthly", `${row.priceMonthly}c`, `${wantCents}c`);
    note("tagline", row.tagline, plan.tagline);
    note("spendGuidance", row.spendGuidance, plan.spendGuidance);
    note("featured", row.featured, plan.featured ?? false);
    note("sortOrder", row.sortOrder, index);
    // Compared as whole documents rather than field by field; the point is
    // whether the row is stale, not which bullet moved.
    note("features", row.featuresJson === wantFeatures ? "same" : "stale", "same");
    note(
      "entitlements",
      row.entitlementsJson === wantEntitlements ? "same" : "stale",
      "same"
    );

    changes.push(...diffs);

    if (write && diffs.length > 0) {
      await db.planConfig.update({
        where: { tier: plan.tier },
        data: {
          name: plan.name,
          priceMonthly: wantCents,
          tagline: plan.tagline,
          spendGuidance: plan.spendGuidance,
          featured: plan.featured ?? false,
          sortOrder: index,
          featuresJson: wantFeatures,
          entitlementsJson: wantEntitlements,
        },
      });
    }
  }

  if (missing.length > 0) {
    console.log(
      `\nNo PlanConfig row for: ${missing.join(", ")} — these already fall back to the code, which is fine.`
    );
  }

  if (changes.length === 0) {
    console.log("\nThe database agrees with the code. Nothing to do.\n");
    return;
  }

  console.log(`\n${write ? "Updated" : "Would update"} ${changes.length} field(s):\n`);
  for (const c of changes) {
    console.log(`  ${c.tier.padEnd(8)} ${c.field.padEnd(14)} ${c.from}  →  ${c.to}`);
  }

  console.log(
    write
      ? "\nDone. The in-app billing screens now match the pricing page.\n"
      : "\nNothing was changed. Re-run with --write to apply.\n"
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
