// Checks the rules that decide whether MAIRO may spend a customer's money.
//
//   npm run check:readiness
//
// This is the one part of the product that starts a campaign with nobody
// pressing anything, so the failures here are expensive in a way a broken
// layout is not. A plan check that reads a cancelled subscription as active
// unlocks paid features for free. A funding check that treats "Meta didn't
// answer" as "yes" puts ads live against a card that may not work. And a
// readiness brief that says "ready" while something is outstanding makes the
// AI tell a customer their ads are running when they are not.
//
// Everything here is a pure function. readinessFor() and maybeGoLive() need a
// database and are verified in the browser instead.

import { hasActivePlan, readinessBrief, type Readiness, type ReadinessStep } from "@/lib/readiness";

let bad = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) {
    bad++;
    console.log(`  FAIL ${n} ${x}`);
  } else console.log(`  ok   ${n}`);
};

function step(id: ReadinessStep["id"], done: boolean, unknown = false): ReadinessStep {
  return { id, done, unknown, label: `Do ${id}`, detail: `Because ${id}.`, href: "/x" };
}

function readiness(steps: ReadinessStep[]): Readiness {
  const next = steps.find((s) => !s.done) ?? null;
  return {
    steps,
    ready: steps.every((s) => s.done),
    next,
    remaining: steps.filter((s) => !s.done).length,
  };
}

console.log("\n— who counts as paying, with billing off —");
{
  delete process.env.BILLING_ENFORCED;
  // The App Review promise: while the switch is off nobody is locked out,
  // including an account that has never paid. Turning it on is what makes the
  // lock real, and that is deliberate rather than an oversight.
  ok(
    "an account with no plan still gets in",
    hasActivePlan({ subscriptionTier: "NONE", subscriptionStatus: null })
  );
  ok(
    "so does a cancelled one",
    hasActivePlan({ subscriptionTier: "STARTER", subscriptionStatus: "canceled" })
  );
}

console.log("\n— and with billing on —");
{
  process.env.BILLING_ENFORCED = "1";

  ok(
    "no plan is refused",
    !hasActivePlan({ subscriptionTier: "NONE", subscriptionStatus: null })
  );
  ok(
    "active is let through",
    hasActivePlan({ subscriptionTier: "STARTER", subscriptionStatus: "active" })
  );
  ok(
    "so is a trial",
    hasActivePlan({ subscriptionTier: "GROWTH", subscriptionStatus: "trialing" })
  );

  // Stripe's failure states. past_due is the one that matters: a card that
  // stopped working must stop the plan working, or the subscription is
  // optional in practice.
  for (const status of ["past_due", "unpaid", "canceled", "incomplete", "paused", null]) {
    ok(
      `${status ?? "no status"} is refused`,
      !hasActivePlan({ subscriptionTier: "SCALE", subscriptionStatus: status })
    );
  }

  // A tier with no matching Stripe subscription is not a free pass.
  ok(
    "a tier set by hand without a live subscription is refused",
    !hasActivePlan({ subscriptionTier: "SCALE", subscriptionStatus: "" })
  );

  delete process.env.BILLING_ENFORCED;
}

console.log("\n— the brief the AI is given —");
{
  const stuck = readiness([
    step("plan", true),
    step("business", true),
    step("ad_account", false),
    step("funding", false),
    step("creative", false),
    step("campaign", false),
  ]);

  const brief = readinessBrief(stuck);
  ok("it says the account cannot run ads", brief.includes("cannot run ads yet"));
  ok("it does not list what is already done", !brief.includes("Do plan"));
  ok("it lists what is outstanding", brief.includes("Do ad_account"));
  ok("in blocking order", brief.indexOf("Do ad_account") < brief.indexOf("Do creative"));
  ok(
    "and tells the model not to be optimistic about it",
    brief.includes("Do not promise")
  );

  const done = readiness([
    step("plan", true),
    step("business", true),
    step("ad_account", true),
    step("funding", true),
    step("creative", true),
    step("campaign", true),
  ]);
  ok("a finished account reads as finished", readinessBrief(done).includes("finished setting up"));
  ok("and is not told it cannot run ads", !readinessBrief(done).includes("cannot run ads"));
}

console.log("\n— unknown is not the same as done —");
{
  // The distinction auto-launch depends on. Meta failing to answer must never
  // round to "yes, there's a card on it".
  const unsure = readiness([
    step("plan", true),
    step("business", true),
    step("ad_account", true),
    step("funding", false, true),
    step("creative", true),
    step("campaign", true),
  ]);

  ok("an unknown step blocks readiness", !unsure.ready);
  ok("and is the one reported as next", unsure.next?.id === "funding");
  ok("and is flagged as unknown rather than missing", unsure.next?.unknown === true);
  ok("one thing left", unsure.remaining === 1);
}

console.log("\n— the order the steps block in —");
{
  // Asking somebody to approve an ad before they have told MAIRO what they
  // sell is asking them to do something that cannot work.
  const nothing = readiness([
    step("plan", false),
    step("business", false),
    step("ad_account", false),
    step("funding", false),
    step("creative", false),
    step("campaign", false),
  ]);
  ok("the first thing asked for is the plan", nothing.next?.id === "plan");
  ok("six things outstanding", nothing.remaining === 6);
  ok("and not ready", !nothing.ready);
}

console.log(bad === 0 ? "\nAll checks passed.\n" : `\n${bad} FAILED\n`);
process.exit(bad === 0 ? 0 : 1);
