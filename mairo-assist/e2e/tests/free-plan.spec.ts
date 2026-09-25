import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, signIn, signUp, uniqueEmail } from "./helpers";

/*
 * Start Free and plan selection, end to end: landing page, Free sign-up and
 * onboarding, paid plans through (fake) Stripe Checkout, upgrading and
 * downgrading from the dashboard, and the mobile layout.
 */

const REST = process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1";
const SERVICE = process.env.SUPABASE_SECRET_KEY!;
const FAKE_STRIPE = process.env.E2E_FAKE_STRIPE!;

test.use({ extraHTTPHeaders: { "x-forwarded-for": "10.40.0.4" } });

async function rest(path: string) {
  const res = await fetch(`${REST}/${path}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function subscriptionOf(businessName: string) {
  const [biz] = await rest(`businesses?select=id&name=eq.${encodeURIComponent(businessName)}`);
  const subs = await rest(`subscriptions?select=plan_key,status,provider,provider_subscription_id,cancel_at_period_end&business_id=eq.${biz.id}`);
  return { businessId: biz.id as string, subs };
}

/** Business setup after the plan step, including a real test chat and activation. */
async function setUpBusiness(page: Page, name: string) {
  await expect(page.getByRole("heading", { name: "What's your business name and website?" })).toBeVisible();
  await page.getByLabel("Business name").fill(name);
  await page.getByLabel("Website").fill("example-store.com");
  await page.getByLabel("Industry").selectOption("Apparel & fashion");
  await page.getByRole("button", { name: "Continue" }).click();
}

async function finishOnboarding(page: Page) {
  await expect(page.getByRole("heading", { name: "What does your business sell?" })).toBeVisible();
  await page.getByText("Physical products", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Customer support", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Nova", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Connect your Shopify store" })).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByLabel("Return policy").fill("Returns within 30 days.");
  await page.getByRole("button", { name: "Continue" }).click();

  // Test for real: the preview runs the AI engine.
  await expect(page.getByRole("heading", { name: "Test your AI employee" })).toBeVisible();
  await page.getByLabel("Test message", { exact: true }).fill("What is your return policy?");
  await page.getByRole("button", { name: "Send test message" }).click();
  await expect(page.getByText("Here's what I found: Returns within 30 days.")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Activate your AI employee" })).toBeVisible();
  await page.getByRole("button", { name: "Activate your AI employee" }).click();
  await expect(page).toHaveURL(/\/dashboard\?welcome=1/);
  await expect(page.getByRole("heading", { name: "Nova is active." })).toBeVisible();
}

test.describe.serial("Start Free", () => {
  const free = { name: "Frida Free", email: uniqueEmail("free") };
  const paid = { name: "Paula Paid", email: uniqueEmail("paid") };

  test("landing page leads with Start Free and shows all five plans", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your Business Never Stops.");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Neither Should Your AI Employee.");
    const hero = page.locator("section").first();
    await expect(hero.getByRole("link", { name: "Start Free" })).toBeVisible();
    for (const t of ["Free Forever", "No Credit Card Required", "100 Free AI Responses Every Month"]) await expect(hero.getByText(t)).toBeVisible();

    await hero.getByRole("link", { name: "Explore Plans" }).click();
    await expect(page).toHaveURL(/#pricing$/);
    await expect(page.locator("#pricing")).toBeInViewport();
    const cards = page.locator('[data-testid^="plan-"]');
    await expect(cards).toHaveCount(5);
    await expect(cards.first()).toHaveAttribute("data-testid", "plan-free");
    await expect(page.getByTestId("plan-growth").getByText("Most Popular")).toBeVisible();
    await expect(page.getByTestId("plan-enterprise")).toContainText("Starting at");
    for (const [key, cta] of [["free", "Start Free"], ["starter", "Choose Starter"], ["growth", "Choose Growth"], ["pro", "Choose Pro"]]) {
      await expect(page.getByTestId(`plan-${key}`).getByRole("link", { name: cta })).toBeVisible();
    }
    await page.getByText("Compare all features").click();
    await expect(page.getByRole("cell", { name: "Advanced AI sales assistance" })).toBeVisible();
    await page.screenshot({ path: "test-results/pricing.png", fullPage: false });
  });

  test("Start Free: sign up, keep Free, onboard, and land on the Free dashboard", async ({ page }) => {
    await page.goto("/");
    await page.locator("section").first().getByRole("link", { name: "Start Free" }).click();
    await expect(page).toHaveURL(/\/signup\?plan=free/);
    await expect(page.getByRole("heading", { name: "Your AI Employee Starts Here." })).toBeVisible();
    await expect(page.getByText("No credit card required.")).toBeVisible();

    // Mismatched passwords are caught before anything is created.
    await page.getByLabel("Full name").fill(free.name);
    await page.getByLabel("Business email").fill(free.email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm password").fill(PASSWORD + "x");
    await page.getByRole("button", { name: "Create Free Account" }).click();
    await expect(page.getByText("Passwords don't match")).toBeVisible();

    await signUp(page, free.name, free.email, "/onboarding/plan?plan=free");
    await expect(page).toHaveURL(/\/onboarding\/plan/);
    await expect(page.getByText("Welcome to Mairo Assist!")).toBeVisible();
    await expect(page.getByText("Let's get your AI employee ready.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start Free. Upgrade Whenever You're Ready." })).toBeVisible();
    await expect(page.locator('[data-testid^="plan-card-"]')).toHaveCount(5);
    await page.getByTestId("free-plan-offer").getByRole("button", { name: "Continue With Free" }).click();

    // First-run welcome: the AI employee "joins the team", once.
    await expect(page).toHaveURL(/\/onboarding\/welcome/);
    await expect(page.getByText("Activating Your AI Employee…")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your New Employee Has Officially Joined the Team." })).toBeVisible();
    await expect(page.getByText("Available 24/7. Ready to help your customers. Powered by Mairo Assist.")).toBeVisible();
    await expect(page.getByTestId("welcome").getByText("Your AI Employee", { exact: true })).toBeVisible();
    await expect(page.getByText("Activating Your AI Employee…")).toBeHidden();
    // Honest status: it isn't live until setup is done.
    await expect(page.getByText("Setup in progress")).toBeVisible();
    const planCard = page.getByTestId("welcome-plan");
    for (const t of ["Free Forever", "100 AI Responses Every Month", "$0/month", "No Credit Card Required"]) await expect(planCard).toContainText(t);
    await page.screenshot({ path: "test-results/welcome.png" });

    await page.getByRole("button", { name: "Explore All Plans" }).click();
    const plans = page.getByRole("dialog", { name: "All plans" });
    await expect(plans.locator('[data-testid^="plan-card-"]')).toHaveCount(5);
    await expect(plans.getByText("Your Free plan stays active while you look.")).toBeVisible();
    await plans.getByRole("button", { name: "Continue With Free" }).click();
    await expect(plans).toBeHidden();
    await page.getByRole("button", { name: "Set Up My AI Employee" }).click();

    await setUpBusiness(page, "Free Forever Goods");
    await finishOnboarding(page);

    await expect(page.getByText("Welcome to Mairo Assist!")).toBeVisible();
    await expect(page.getByTestId("overview-plan")).toHaveText("Free Forever");
    await expect(page.getByTestId("credits-remaining").first()).toContainText("100 / 100 remaining");
    const now = new Date();
    const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    await expect(page.getByText(new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(reset)).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Unlock More From Your AI Employee." })).toBeVisible();
    for (const p of ["Starter", "Growth", "Pro"]) await expect(page.getByRole("link", { name: `Upgrade to ${p}` })).toBeVisible();
    await page.screenshot({ path: "test-results/free-dashboard.png", fullPage: true });

    // Exactly one Free subscription, never charged.
    const { subs } = await subscriptionOf("Free Forever Goods");
    expect(subs).toEqual([{ plan_key: "free", status: "active", provider: "none", provider_subscription_id: null, cancel_at_period_end: false }]);

    // The welcome never replays.
    await page.goto("/onboarding/welcome");
    await expect(page).not.toHaveURL(/\/onboarding\/welcome/);

    // Start Free again while signed in goes straight to the dashboard (nothing new is created).
    await page.goto("/start");
    await expect(page).toHaveURL(/\/dashboard$/);
    expect(await rest(`businesses?select=id&name=eq.${encodeURIComponent("Free Forever Goods")}`)).toHaveLength(1);
  });

  test("Free users can compare plans without upgrading, and Free features are enforced", async ({ page }) => {
    await signIn(page, free.email);
    await page.getByTestId("nav-upgrade").first().click();
    await expect(page).toHaveURL(/\/dashboard\/upgrade/);
    await expect(page.getByTestId("current-plan")).toContainText("Free Forever");
    await expect(page.getByTestId("plan-card-free")).toContainText("You have everything in this plan");
    await expect(page.getByTestId("plan-card-growth")).toContainText("Unlocks:");
    await expect(page.getByTestId("plan-card-growth")).toContainText("Order tracking");
    await page.goto("/dashboard/team");
    await expect(page.getByText("Team members are included from the Pro plan.")).toBeVisible();
  });

  test("a paid plan picked on the pricing page is charged only after Stripe confirms payment", async ({ page }) => {
    await page.goto("/#pricing");
    await page.getByTestId("plan-growth").getByRole("link", { name: "Choose Growth" }).click();
    await expect(page).toHaveURL(/\/signup\?plan=growth/);
    await expect(page.getByText("You picked Growth.")).toBeVisible();
    await signUp(page, paid.name, paid.email, "/onboarding/plan?plan=growth");
    await expect(page).toHaveURL(/\/onboarding\/plan\?plan=growth/);
    // With reduced motion the welcome appears in its final state at once.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByTestId("plan-card-growth").getByRole("button", { name: "Choose Growth" }).click();
    await expect(page.getByRole("heading", { name: "Your New Employee Has Officially Joined the Team." })).toBeVisible({ timeout: 1500 });
    await expect(page.getByText("Activating Your AI Employee…")).toBeHidden();
    await expect(page.getByText("You picked Growth — you'll confirm it after setting up your business.")).toBeVisible();
    await page.getByRole("button", { name: "Set Up My AI Employee" }).click();
    await setUpBusiness(page, "Growth Mode Co");

    // The business exists and is on Free until payment is confirmed.
    await expect(page).toHaveURL(/\/onboarding\/payment/);
    await expect(page.getByRole("heading", { name: "Confirm Growth" })).toBeVisible();
    expect((await subscriptionOf("Growth Mode Co")).subs[0]).toMatchObject({ plan_key: "free", provider: "none" });

    await page.getByRole("button", { name: /Continue to secure payment/ }).click();
    await expect(page.getByRole("heading", { name: "Fake Stripe Checkout" })).toBeVisible();
    // Declined card: nothing changes.
    await page.getByRole("button", { name: "Decline card" }).click();
    await expect(page.getByText("Your card was declined.")).toBeVisible();
    expect((await subscriptionOf("Growth Mode Co")).subs[0].plan_key).toBe("free");

    await page.getByRole("button", { name: "Pay" }).click();
    await expect(page).toHaveURL(/\/onboarding\?step=2&checkout=success/);
    await expect(page.getByText("Payment confirmed")).toBeVisible();
    const { subs } = await subscriptionOf("Growth Mode Co");
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ plan_key: "growth", status: "active", provider: "stripe" });
    expect(subs[0].provider_subscription_id).toMatch(/^sub_/);

    // The webhook for the same checkout is applied once and changes nothing further.
    await expect.poll(async () => (await rest(`integration_webhooks?select=status&provider=eq.stripe&topic=eq.checkout.session.completed`)).length).toBeGreaterThan(0);
    expect((await subscriptionOf("Growth Mode Co")).subs).toHaveLength(1);
  });

  test("a Free user upgrades from the dashboard, keeps everything, and can downgrade", async ({ page }) => {
    await signIn(page, free.email);
    await page.goto("/dashboard/upgrade?plan=pro");
    // Abandoning checkout changes nothing.
    await page.getByTestId("plan-card-pro").getByRole("button", { name: "Upgrade to Pro" }).click();
    await expect(page.getByRole("heading", { name: "Fake Stripe Checkout" })).toBeVisible();
    await page.getByRole("link", { name: "Cancel and go back" }).click();
    await expect(page).toHaveURL(/checkout=canceled/);
    await expect(page.getByText("Checkout was cancelled. Nothing was charged")).toBeVisible();
    await expect(page.getByTestId("current-plan")).toContainText("Free Forever");

    await page.getByTestId("plan-card-pro").getByRole("button", { name: "Upgrade to Pro" }).click();
    await page.getByRole("button", { name: "Pay" }).click();
    await expect(page).toHaveURL(/\/dashboard\/upgrade\?checkout=success/);
    await expect(page.getByTestId("current-plan")).toContainText("Pro");
    await expect(page.getByTestId("credits-remaining")).toContainText("15,000 / 15,000 remaining");

    // Existing setup is untouched and Pro features unlock immediately.
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Nova is active." })).toBeVisible();
    await page.goto("/dashboard/team");
    await expect(page.getByRole("heading", { name: "Invite a teammate" })).toBeVisible();

    // Switching between paid plans is prorated in place (no second subscription).
    await page.goto("/dashboard/upgrade");
    await page.getByTestId("plan-card-growth").getByRole("button", { name: "Switch to Growth" }).click();
    await expect(page.getByText("You're now on Growth.")).toBeVisible();
    const { businessId, subs } = await subscriptionOf("Free Forever Goods");
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ plan_key: "growth", provider: "stripe" });

    // Downgrading keeps the paid plan until the period ends, then Stripe ends it.
    await page.getByTestId("plan-card-free").getByRole("button", { name: "Downgrade to Free" }).click();
    await expect(page.getByText("Your paid plan will end at the close of this billing period")).toBeVisible();
    expect((await subscriptionOf("Free Forever Goods")).subs[0]).toMatchObject({ plan_key: "growth", cancel_at_period_end: true });
    await fetch(`${FAKE_STRIPE}/__cancel`, { method: "POST", body: JSON.stringify({ subscription: subs[0].provider_subscription_id }) });
    await expect.poll(async () => (await subscriptionOf("Free Forever Goods")).subs[0].plan_key, { timeout: 15_000 }).toBe("free");
    const [emp] = await rest(`ai_employees?select=name,status&business_id=eq.${businessId}`);
    expect(emp).toEqual({ name: "Nova", status: "active" });
  });

  test("Stripe webhooks must be signed", async ({ request }) => {
    const res = await request.post("/api/webhooks/stripe", {
      headers: { "stripe-signature": "t=1,v1=deadbeef", "content-type": "application/json" },
      data: { id: "evt_forged", type: "customer.subscription.updated", data: { object: {} } },
    });
    expect(res.status()).toBe(401);
    const forgedReturn = await request.get("/api/billing/return?session_id=cs_test_forged123&next=/dashboard/upgrade", { maxRedirects: 0 });
    expect(forgedReturn.status()).toBe(307);
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Start Free is visible immediately and plans stack with Free first", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("section").first().getByRole("link", { name: "Start Free" })).toBeInViewport();
    await expect(page.getByRole("banner").getByRole("link", { name: "Start Free" })).toBeVisible();
    // Measure both cards in one go (the page may still be smooth-scrolling).
    const layout = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#pricing [data-testid^="plan-"]')].map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.getAttribute("data-testid"), top: r.top, bottom: r.bottom, width: r.width };
      });
      return cards;
    });
    expect(layout.map((c) => c.id)).toEqual(["plan-free", "plan-starter", "plan-growth", "plan-pro", "plan-enterprise"]);
    for (let i = 1; i < layout.length; i++) expect(layout[i].top).toBeGreaterThanOrEqual(layout[i - 1].bottom);
    expect(layout[0].width).toBeGreaterThan(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: "test-results/mobile-landing.png" });
  });
});
