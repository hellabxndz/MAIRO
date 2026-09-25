import { expect, test, type Page } from "@playwright/test";
import { onboard, setPlan, signIn, signUp, uniqueEmail } from "./helpers";

/*
 * Phase 4 end to end: the chat widget on a (fake) Shopify storefront. The
 * fake store signs App Proxy requests exactly like Shopify, loads the script
 * tag the app installs, and shares customer data ("approved-" shops).
 */

const REST = process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1";
const SERVICE = process.env.SUPABASE_SECRET_KEY!;
const FAKE_SHOPIFY = process.env.E2E_FAKE_SHOPIFY!;
const SMTP = process.env.E2E_SMTP_HTTP!;
const SHOP = "approved-outfitters.myshopify.com";
const STOREFRONT = `${FAKE_SHOPIFY}/shops/${SHOP}/`;
const owner = { name: "Wendy Widget", email: uniqueEmail("p4owner") };

test.use({ extraHTTPHeaders: { "x-forwarded-for": "10.50.0.5" } });

async function rest(path: string) {
  const res = await fetch(`${REST}/${path}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function businessId() {
  const [b] = await rest(`businesses?select=id&name=eq.${encodeURIComponent("Widget Outfitters")}`);
  return b.id as string;
}

/** The widget renders in an open shadow root; Playwright's locators pierce it. */
async function openChat(page: Page) {
  await page.goto(STOREFRONT);
  const bubble = page.getByRole("button", { name: /Chat with Nova/ });
  await expect(bubble).toBeVisible({ timeout: 15_000 });
  await bubble.click();
  return page.getByRole("dialog", { name: "Chat with Nova" });
}

async function say(page: Page, text: string) {
  const chat = page.getByRole("dialog", { name: "Chat with Nova" });
  await chat.getByLabel("Message").fill(text);
  await chat.getByRole("button", { name: "Send" }).click();
}

test.describe.serial("Phase 4", () => {
  test("owner connects a store, activates the AI and turns on the widget", async ({ page }) => {
    await signUp(page, owner.name, owner.email);
    await onboard(page, "Widget Outfitters");
    // Order lookup is a Growth feature.
    await setPlan("Widget Outfitters", "growth");

    // Nothing to show before the store is connected.
    await page.goto("/dashboard/widget");
    await expect(page.getByTestId("widget-checklist")).toContainText("Shopify store connected");
    await expect(page.getByRole("button", { name: "Turn on chat widget" })).toHaveCount(0);

    await page.goto("/dashboard/integrations");
    await page.getByLabel("Store address").fill(SHOP);
    await page.getByRole("button", { name: "Connect Shopify" }).click();
    await expect(page).toHaveURL(/shopify=connected/);
    const id = await businessId();
    await expect.poll(async () => (await rest(`shopify_connections?select=last_sync_status&business_id=eq.${id}`))[0]?.last_sync_status, { timeout: 30_000 }).toBe("succeeded");
    const [conn] = await rest(`shopify_connections?select=customer_data_enabled,scopes&business_id=eq.${id}`);
    expect(conn.customer_data_enabled).toBe(true);
    expect(conn.scopes).toContain("write_script_tags");

    // Test, publish and activate the AI employee.
    await page.goto("/dashboard/ai-employee");
    await page.getByLabel("Test message", { exact: true }).fill("What is your return policy?");
    await page.getByRole("button", { name: "Send test message" }).click();
    await expect(page.getByText("Here's what I found: Returns within 30 days.")).toBeVisible();
    await page.getByRole("button", { name: "Publish Changes" }).click();
    await page.getByRole("button", { name: "Confirm publish" }).click();
    await expect(page.getByText(/Version 1 published/)).toBeVisible();
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Activate AI" }).click();
    await expect(page.getByRole("heading", { name: "Nova is active." })).toBeVisible();

    // The widget page checks every requirement, including the store's App Proxy.
    await page.goto("/dashboard/widget");
    const checklist = page.getByTestId("widget-checklist");
    await expect(checklist.getByLabel("Done", { exact: true })).toHaveCount(4);
    await expect(checklist.getByLabel("Not done", { exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: "Turn on chat widget" }).click();
    await expect(page.getByText("The chat widget is on your store.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your AI employee is live on your store" })).toBeVisible();
    await page.screenshot({ path: "test-results/widget-page.png", fullPage: true });
  });

  test("a shopper chats on the storefront and gets real product answers", async ({ page }) => {
    const chat = await openChat(page);
    await expect(chat.getByText("AI assistant · Widget Outfitters")).toBeVisible();
    await say(page, "Do you sell boots?");
    await expect(chat.getByText("We have Trail Boot (120.00 USD).")).toBeVisible({ timeout: 15_000 });
    await expect(chat.getByRole("link", { name: /Trail Boot/ })).toHaveAttribute("href", "https://fixture.example/products/101");
    await page.screenshot({ path: "test-results/storefront-chat.png" });

    // One credit used, and the conversation is in the inbox.
    const id = await businessId();
    const period = new Date().toISOString().slice(0, 8) + "01";
    await expect.poll(async () => (await rest(`usage_counters?select=ai_responses&business_id=eq.${id}&period_start=eq.${period}`))[0]?.ai_responses).toBe(1);
    const convs = await rest(`conversations?select=channel,message_count&business_id=eq.${id}&channel=eq.widget`);
    expect(convs).toEqual([{ channel: "widget", message_count: 2 }]);

    // The chat survives a page reload (same browser).
    await page.reload();
    await page.getByRole("button", { name: /Chat with Nova/ }).click();
    await expect(page.getByRole("dialog", { name: "Chat with Nova" }).getByText("We have Trail Boot (120.00 USD).")).toBeVisible();
  });

  test("a shopper verifies with an emailed code before seeing their order", async ({ page }) => {
    const started = Date.now();
    const chat = await openChat(page);
    await say(page, "Where is my order #1001? My email is buyer@example.com");
    await expect(chat.getByText("I've emailed a 6-digit code to the address on that order. Please type it here.")).toBeVisible({ timeout: 15_000 });
    // No order details before verification.
    await expect(chat.getByText("1Z999")).toHaveCount(0);

    let code = "";
    await expect.poll(async () => {
      const list = (await (await fetch(`${SMTP}/messages?to=buyer@example.com`)).json()) as { subject: string; at: number }[];
      code = /(\d{6})/.exec(list.filter((m) => m.at >= started).at(-1)?.subject ?? "")?.[1] ?? "";
      return code;
    }, { timeout: 15_000 }).toMatch(/^\d{6}$/);

    const wrong = code === "000000" ? "111111" : "000000";
    await say(page, wrong);
    await expect(chat.getByText("That code isn't right. Ask the customer to check it and try again.")).toBeVisible({ timeout: 15_000 });
    await say(page, code);
    await expect(chat.getByText("Order #1001 is IN_TRANSIT — UPS tracking 1Z999.")).toBeVisible({ timeout: 15_000 });

    // A wrong email gets the same answer and no email is sent.
    const before = ((await (await fetch(`${SMTP}/messages?to=someone@else.com`)).json()) as unknown[]).length;
    await say(page, "Order #1001, email someone@else.com please");
    await expect(chat.getByText("I've emailed a 6-digit code to the address on that order. Please type it here.")).toHaveCount(2, { timeout: 15_000 });
    expect(((await (await fetch(`${SMTP}/messages?to=someone@else.com`)).json()) as unknown[]).length).toBe(before);
  });

  test("the team takes over from the inbox and the shopper sees it", async ({ page, browser }) => {
    const chat = await openChat(page);
    await say(page, "Hello there, quick question");
    await expect(chat.getByText("Hi! I'm here to help with anything about the store.")).toBeVisible({ timeout: 15_000 });
    const [conv] = await rest(`conversations?select=id&channel=eq.widget&subject=eq.${encodeURIComponent("Hello there, quick question")}`);

    const team = await browser.newPage();
    await signIn(team, owner.email);
    await team.goto(`/dashboard/inbox?c=${conv.id}`);
    await team.getByRole("button", { name: "Take over" }).click();
    await expect(team.getByTestId("speaking-with")).toHaveText(/talking to your team/);
    await team.getByLabel("Reply", { exact: true }).fill("Hi! This is Wendy from the team.");
    await team.getByRole("button", { name: "Send reply" }).click();
    await expect(team.getByText("Hi! This is Wendy from the team.")).toBeVisible();
    await team.close();

    // The shopper's open chat picks up the reply, and the AI stays silent from now on.
    await expect(chat.getByText("Hi! This is Wendy from the team.")).toBeVisible({ timeout: 15_000 });
    await expect(chat.getByText("You're now chatting with the Widget Outfitters team.")).toBeVisible();
    await say(page, "Thanks Wendy");
    await expect(chat.getByText("Thanks Wendy")).toBeVisible();
    await page.waitForTimeout(3000);
    const msgs = await rest(`conversation_messages?select=sender_type&conversation_id=eq.${conv.id}&order=created_at.desc&limit=1`);
    expect(msgs).toEqual([{ sender_type: "customer" }]);
  });

  test("storefront requests must be signed by Shopify and stay private per browser", async ({ request, page }) => {
    // Straight to the app without Shopify's signature: refused.
    expect((await request.get("/api/proxy/config?shop=" + SHOP)).status()).toBe(401);
    expect((await request.post("/api/proxy/messages?shop=" + SHOP, { data: { visitor: "a".repeat(48), text: "hi" } })).status()).toBe(401);

    // Another browser can't read someone else's conversation.
    const [conv] = await rest(`conversations?select=id&channel=eq.widget&order=created_at.asc&limit=1`);
    const res = await fetch(`${FAKE_SHOPIFY}/shops/${SHOP}/apps/mairo-assist/messages?visitor=${"b".repeat(48)}&conversation=${conv.id}`);
    expect(await res.json()).toMatchObject({ messages: [] });

    // Mobile: the chat opens full screen.
    await page.setViewportSize({ width: 390, height: 844 });
    const chat = await openChat(page);
    const box = await chat.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(389);
    await page.screenshot({ path: "test-results/storefront-chat-mobile.png" });
  });

  test("removing the widget takes it off the store", async ({ page }) => {
    await signIn(page, owner.email);
    await page.goto("/dashboard/widget");
    await page.getByRole("button", { name: "Remove from my store" }).click();
    await expect(page.getByText("The chat widget was removed from your store.")).toBeVisible();
    await page.goto(STOREFRONT);
    await page.waitForTimeout(1500);
    await expect(page.getByRole("button", { name: /Chat with Nova/ })).toHaveCount(0);
  });
});
