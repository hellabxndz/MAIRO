import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { onboard, signIn, signUp, uniqueEmail } from "./helpers";

/*
 * Phase 2 end-to-end: AI employee editing, preview against the (fake) OpenAI
 * endpoint, publishing and versions, activation, knowledge base, and the
 * inbox with human takeover.
 */

const owner = { name: "Paula Phase", email: uniqueEmail("p2owner") };
const REST = process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1";
const SERVICE = process.env.SUPABASE_SECRET_KEY!;

// A separate client address so sign-up rate limits don't interact with phase 1.
test.use({ extraHTTPHeaders: { "x-forwarded-for": "10.20.0.2" } });

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${REST}/${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

test.describe.serial("Phase 2", () => {
  test("owner edits the AI employee and tests it in preview", async ({ page }) => {
    await signUp(page, owner.name, owner.email);
    await onboard(page, "Phase Two Denim");
    await page.goto("/dashboard/ai-employee");
    await expect(page.getByRole("heading", { name: "Nova" })).toBeVisible();

    await page.getByLabel("Brand personality").selectOption("luxury");
    await page.getByLabel("Welcome message").fill("Welcome to Phase Two Denim. How can I help?");
    await page.getByLabel("Instructions", { exact: true }).fill("Speak calmly. Never promise delivery dates.");
    await page.getByLabel("AI name").fill("<b>");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("Use letters, numbers, spaces")).toBeVisible();
    await page.getByLabel("AI name").fill("Nova");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("Draft saved.")).toBeVisible();

    // Preview runs the real engine: it searches the knowledge base saved during onboarding.
    const chat = page.getByLabel("Test message", { exact: true });
    await chat.fill("What is your return policy?");
    await page.getByRole("button", { name: "Send test message" }).click();
    await expect(page.getByText("Here's what I found: Returns within 30 days.")).toBeVisible();
    await expect(page.getByText("Searched knowledge base")).toBeVisible();
    await expect(page.locator("span", { hasText: /^Return policy$/ })).toBeVisible();

    // Escalation is simulated in preview.
    await chat.fill("Can I talk to a real person?");
    await page.getByRole("button", { name: "Send test message" }).click();
    await expect(page.getByText("A person from the team will follow up with you here.")).toBeVisible();
    await expect(page.getByText("Handed over to a person")).toBeVisible();
    await page.screenshot({ path: "test-results/ai-employee.png" });

    // The model received the draft settings and the fixed safety rules.
    const reqs = (await (await fetch(`${process.env.E2E_FAKE_OPENAI}/__requests`)).json()) as { body: { instructions: string } }[];
    const instructions = reqs.filter((r) => r.body.instructions.includes("Phase Two Denim")).at(-1)!.body.instructions;
    expect(instructions).toContain("refined, attentive and understated");
    expect(instructions).toContain("<owner_instructions>\nSpeak calmly. Never promise delivery dates.");
    expect(instructions.indexOf("# Rules")).toBeLessThan(instructions.indexOf("<owner_instructions>"));
  });

  test("preview chats never reach the inbox or analytics", async ({ page }) => {
    await signIn(page, owner.email);
    await page.goto("/dashboard/inbox");
    await expect(page.getByText("No conversations yet")).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByText("No activity yet")).toBeVisible();
  });

  test("publish, activate, pause; versions can be restored", async ({ page }) => {
    await signIn(page, owner.email);
    await page.goto("/dashboard");
    // Tested but not published: still can't be switched on.
    await expect(page.getByRole("button", { name: "Activate AI" })).toBeDisabled();

    await page.goto("/dashboard/ai-employee");
    await page.getByRole("button", { name: "Publish Changes" }).click();
    await page.getByLabel("Version note").fill("Luxury tone");
    await page.getByRole("button", { name: "Confirm publish" }).click();
    await expect(page.getByText("Version 1 published.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Version 1").first()).toBeVisible();
    await expect(page.getByText("Live", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish Changes" })).toBeDisabled();

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Activate AI" }).click();
    await expect(page.getByText("Your AI employee is active.").first()).toBeVisible();
    await page.reload();
    await expect(page.getByText("Nova is active.")).toBeVisible();
    await page.getByRole("button", { name: "Pause AI" }).click();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(page.getByText("Your AI employee is paused.").first()).toBeVisible();

    // Change the draft, then restore version 1.
    await page.goto("/dashboard/ai-employee");
    await page.getByLabel("Welcome message").fill("A different greeting");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("Draft saved.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish Changes" })).toBeEnabled();
    await page.getByRole("button", { name: "Restore to draft" }).click();
    await expect(page.getByText("Version 1 restored to your draft.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Welcome message")).toHaveValue("Welcome to Phase Two Denim. How can I help?");
    await expect(page.getByRole("button", { name: "Publish Changes" })).toBeDisabled();
  });

  test("knowledge base: add, inspect, upload, delete", async ({ page }) => {
    await signIn(page, owner.email);
    await page.goto("/dashboard/knowledge");
    await expect(page.getByTestId("knowledge-doc")).toHaveCount(2); // shipping + returns from onboarding

    await page.getByLabel("Title", { exact: true }).fill("Do the jeans run large?");
    await page.locator("#new-category").selectOption("sizing_guide");
    await page.getByLabel("Content").fill("Our jeans run half a size large. Most customers size down.");
    await page.getByRole("button", { name: "Add to knowledge base" }).click();
    await expect(page.getByText("Added. Your AI employee can use it right away.")).toBeVisible();

    await page.getByLabel("Test question").fill("do your jeans run big or large?");
    await page.getByRole("button", { name: "Test" }).click();
    await expect(page.getByText("#1 · Do the jeans run large?")).toBeVisible();

    await page.getByLabel("Test question").fill("xylophone quantum");
    await page.getByRole("button", { name: "Test" }).click();
    await expect(page.getByText("Nothing matched.")).toBeVisible();

    const file = "test-results/holiday-hours.txt";
    writeFileSync(file, "Holiday hours: we are closed on December 25 and January 1.");
    await page.getByLabel("Document").setInputFiles(file);
    await page.locator("#upload-category").selectOption("business_hours");
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(page.getByText("“holiday-hours” was added (1 searchable passage).")).toBeVisible();

    const fake = "test-results/fake.pdf";
    writeFileSync(fake, "<html>not a pdf</html>");
    await page.getByLabel("Document").setInputFiles(fake);
    await page.locator("#upload-category").selectOption("faq");
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(page.getByText("Upload a .txt, .md, .pdf or .docx file.")).toBeVisible();

    await expect(page.getByTestId("knowledge-doc")).toHaveCount(4);
    const row = page.getByTestId("knowledge-doc").filter({ hasText: "Do the jeans run large?" });
    await row.getByRole("button", { name: "Delete Do the jeans run large?" }).click();
    await row.getByRole("button", { name: "Confirm delete" }).click();
    await expect(page.getByTestId("knowledge-doc")).toHaveCount(3);
    await page.screenshot({ path: "test-results/knowledge.png", fullPage: true });
  });

  test("inbox: read, take over, reply, hand back, resolve", async ({ page }) => {
    const [business] = await rest(`businesses?select=id&name=eq.${encodeURIComponent("Phase Two Denim")}`);
    const [customer] = await rest("customers", { method: "POST", body: JSON.stringify({ business_id: business.id, name: "Casey Customer", email: "casey@example.com" }) });
    const [conv] = await rest("conversations", { method: "POST", body: JSON.stringify({ business_id: business.id, customer_id: customer.id, channel: "widget" }) });
    await rest("conversation_messages", {
      method: "POST",
      body: JSON.stringify([
        { business_id: business.id, conversation_id: conv.id, sender_type: "customer", content: "Do you ship to Canada?", tool_names: [], sources: [] },
        { business_id: business.id, conversation_id: conv.id, sender_type: "ai", content: "Yes — we ship to Canada in 5–7 business days.", tool_names: ["search_knowledge"], sources: [{ id: "x", title: "Shipping policy", category: "shipping_policy" }] },
      ]),
    });

    await signIn(page, owner.email);
    await page.goto("/dashboard/inbox");
    await page.getByRole("link", { name: /Casey Customer/ }).click();
    await expect(page.getByTestId("speaking-with")).toHaveText(/talking to the AI/);
    await expect(page.getByText("Yes — we ship to Canada in 5–7 business days.")).toBeVisible();
    await expect(page.getByLabel("How the AI answered")).toContainText("Shipping policy");
    await expect(page.getByLabel("Customer")).toContainText("casey@example.com");

    await page.getByRole("button", { name: "Take over" }).click();
    await expect(page.getByTestId("speaking-with")).toHaveText(/talking to your team \(Paula Phase\) — AI is silent/);
    await expect(page.getByText("Paula from the team joined the conversation.")).toBeVisible();

    await page.getByLabel("Reply", { exact: true }).fill("Hi Casey, I can confirm Canada shipping is 5–7 days.");
    await page.getByRole("button", { name: "Send reply" }).click();
    await expect(page.getByText("Hi Casey, I can confirm Canada shipping is 5–7 days.")).toBeVisible();
    await expect(page.getByText("Paula Phase (team)")).toBeVisible();

    await page.screenshot({ path: "test-results/inbox.png" });
    await page.getByRole("button", { name: "Hand back to AI" }).click();
    await expect(page.getByTestId("speaking-with")).toHaveText(/talking to the AI/);
    await page.getByRole("button", { name: "Mark resolved" }).click();
    await expect(page.locator("header").getByText("Resolved")).toBeVisible();

    // A person replied, so this does not count as resolved by the AI.
    const events = await rest(`analytics_events?select=event_type&conversation_id=eq.${conv.id}`);
    expect(events).toEqual([]);
    await page.goto("/dashboard/inbox?status=resolved");
    await expect(page.getByRole("link", { name: /Casey Customer/ })).toBeVisible();
  });

  test("every dashboard page loads without errors", async ({ page }) => {
    await signIn(page, owner.email);
    for (const path of [
      "/dashboard", "/dashboard/inbox", "/dashboard/inbox?status=needs_attention", "/dashboard/orders", "/dashboard/approvals",
      "/dashboard/customers", "/dashboard/customers?q=casey", "/dashboard/products", "/dashboard/products?q=jeans",
      "/dashboard/ai-employee", "/dashboard/knowledge", "/dashboard/analytics", "/dashboard/analytics?range=custom&from=2026-01-01&to=2026-02-01",
      "/dashboard/integrations", "/dashboard/team", "/dashboard/billing", "/dashboard/settings", "/account",
    ]) {
      await page.goto(path);
      await expect(page.getByText("Something went wrong"), path).toHaveCount(0);
      await expect(page.locator("h1").first(), path).toBeVisible();
    }
  });

  test("the cron endpoint requires its secret", async ({ request }) => {
    expect((await request.get("/api/cron/jobs")).status()).toBe(401);
    expect((await request.get("/api/cron/jobs", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
    const ok = await request.get("/api/cron/jobs", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toMatchObject({ jobs: { claimed: 0 }, purgedConversations: expect.any(Number) });
  });
});
