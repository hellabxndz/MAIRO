import { expect, type Page } from "@playwright/test";

export const SMTP = process.env.E2E_SMTP_HTTP ?? "http://127.0.0.1:54326";
export const PASSWORD = "correct-horse-42";

export function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Wait for the newest email to `to` (optionally matching a subject) and return its first link. */
export async function latestLink(to: string, opts: { after?: number; match?: RegExp } = {}) {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${SMTP}/messages?to=${encodeURIComponent(to)}`);
    const list = (await res.json()) as { subject: string; body: string; at: number }[];
    const hits = list.filter((m) => m.at >= (opts.after ?? 0) && (!opts.match || opts.match.test(m.subject + m.body)));
    const last = hits.at(-1);
    const href = last && /href="([^"]+)"/.exec(last.body)?.[1];
    if (href) return href.replaceAll("&amp;", "&");
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email with a link for ${to}`);
}

export async function signUp(page: Page, name: string, email: string, next?: string) {
  const started = Date.now();
  await page.goto(next ? `/signup?next=${encodeURIComponent(next)}` : "/signup");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Business email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create Free Account" }).click();
  await expect(page).toHaveURL(/\/verify-email/);
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const link = await latestLink(email, { after: started });
  await page.goto(link);
}

export async function signIn(page: Page, email: string, password = PASSWORD, expectSuccess = true) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  if (expectSuccess) await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Complete all eight onboarding steps with sensible answers. */
export async function onboard(page: Page, businessName: string) {
  await expect(page).toHaveURL(/\/onboarding/);
  if (page.url().includes("/onboarding/plan")) {
    await expect(page.getByRole("heading", { name: "Start Free. Upgrade Whenever You're Ready." })).toBeVisible();
    await page.getByTestId("free-plan-offer").getByRole("button", { name: "Continue With Free" }).click();
    await expect(page).toHaveURL(/\/onboarding\/welcome/);
    // Skip jumps straight to the end state (the button fades out once the animation is over).
    await page.getByRole("button", { name: "Skip" }).click({ timeout: 2500 }).catch(() => {});
    await expect(page.getByRole("heading", { name: "Your New Employee Has Officially Joined the Team." })).toBeVisible();
    await page.getByRole("button", { name: "Set Up My AI Employee" }).click();
  }
  await page.getByLabel("Business name").fill(businessName);
  await page.getByLabel("Website").fill("example-store.com");
  await page.getByLabel("Industry").selectOption("Apparel & fashion");
  await page.getByLabel("Describe your business").fill("Vintage-inspired denim.");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "What does your business sell?" })).toBeVisible();
  await page.getByText("Physical products", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: /What would you like your AI employee/ })).toBeVisible();
  await page.getByText("Customer support", { exact: true }).click();
  await page.getByText("Order tracking", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "What should we call your AI employee?" })).toBeVisible();
  await page.getByText("Nova", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Connect your Shopify store" })).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();

  await expect(page.getByRole("heading", { name: /Teach your AI employee/ })).toBeVisible();
  await page.getByLabel("Shipping policy").fill("We ship in 3-5 business days.");
  await page.getByLabel("Return policy").fill("Returns within 30 days.");
  await page.getByLabel("Instructions for your AI employee").fill("Speak casually. Do not invent shipping dates.");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Test your AI employee" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Activate your AI employee" })).toBeVisible();
  await page.getByRole("button", { name: "Skip for now — go to my dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Put a business on a plan directly (as our team would for a manual/comped plan). Tests only. */
export async function setPlan(businessName: string, plan: "free" | "starter" | "growth" | "pro") {
  const rest = process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1";
  const key = process.env.SUPABASE_SECRET_KEY!;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const [biz] = await (await fetch(`${rest}/businesses?select=id&name=eq.${encodeURIComponent(businessName)}`, { headers })).json();
  const res = await fetch(`${rest}/subscriptions?business_id=eq.${biz.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(plan === "free" ? { plan_key: "free", provider: "none" } : { plan_key: plan, provider: "manual" }),
  });
  if (!res.ok) throw new Error(`setPlan failed: ${res.status} ${await res.text()}`);
}
