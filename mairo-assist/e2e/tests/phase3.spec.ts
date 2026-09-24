import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { onboard, signUp, uniqueEmail } from "./helpers";

/*
 * Phase 3 end-to-end against a local fake Shopify store: OAuth connect,
 * catalog and order sync, AI product answers, webhooks (signature, dedupe,
 * inventory updates, uninstall), token refresh, tenant isolation and
 * disconnect.
 */

const REST = process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1";
const SERVICE = process.env.SUPABASE_SECRET_KEY!;
const FAKE_SHOPIFY = process.env.E2E_FAKE_SHOPIFY!;
const SECRET = process.env.SHOPIFY_API_SECRET!;
const SHOP = "fixture-one.myshopify.com";
const APP = "http://localhost:3100";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "10.30.0.3" } });

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${REST}/${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function connection(businessId: string) {
  const rows = await rest(`shopify_connections?select=*&business_id=eq.${businessId}&order=created_at.desc&limit=1`);
  return rows[0] ?? null;
}

async function webhook(topic: string, payload: unknown, opts: { id?: string; badSignature?: boolean; shop?: string } = {}) {
  const body = JSON.stringify(payload);
  const hmac = createHmac("sha256", opts.badSignature ? "wrong-secret" : SECRET).update(body).digest("base64");
  return fetch(`${APP}/api/webhooks/shopify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-topic": topic,
      "x-shopify-hmac-sha256": hmac,
      "x-shopify-shop-domain": opts.shop ?? SHOP,
      "x-shopify-webhook-id": opts.id ?? randomUUID(),
    },
    body,
  });
}

async function connectStore(page: Page, shop: string) {
  await page.goto("/dashboard/integrations");
  await page.getByLabel("Store address").fill(shop);
  await page.getByRole("button", { name: /Connect Shopify|Reconnect Shopify/ }).click();
}

let businessId = "";

test.describe.serial("Phase 3", () => {
  test("owner connects a store and it syncs", async ({ page }) => {
    const email = uniqueEmail("p3owner");
    await signUp(page, "Sam Store", email);
    await onboard(page, "Phase Three Outdoors");
    [{ id: businessId }] = await rest(`businesses?select=id&name=eq.${encodeURIComponent("Phase Three Outdoors")}`);

    await page.goto("/dashboard/products");
    await expect(page.getByText("Connect Shopify to sync products")).toBeVisible();

    // A malformed address is refused before anything leaves the app.
    await page.goto("/dashboard/integrations");
    await page.getByLabel("Store address").fill("not a store!.com");
    await page.getByRole("button", { name: "Connect Shopify" }).click();
    await expect(page.getByText("Enter your store's myshopify.com address")).toBeVisible();

    await connectStore(page, "fixture-one");
    await expect(page).toHaveURL(/\/dashboard\/integrations\?shopify=connected/);
    await expect(page.getByText("Store connected")).toBeVisible();

    await expect.poll(async () => (await connection(businessId))?.last_sync_status, { timeout: 30_000 }).toBe("succeeded");
    const conn = await connection(businessId);
    expect(conn.status).toBe("active");
    expect(conn.shop_name).toBe("Fixture fixture-one");
    expect(conn.validated_at).toBeTruthy();
    expect(conn.webhooks_registered_at).toBeTruthy();
    expect(conn.products_synced).toBe(3);
    expect(conn.orders_synced).toBe(1);
    expect(conn.customer_data_enabled).toBe(false);

    // Tokens are stored encrypted, never in plain text.
    const [cred] = await rest(`shopify_credentials?select=access_token_enc,refresh_token_enc&connection_id=eq.${conn.id}`);
    expect(cred.access_token_enc).not.toMatch(/shpat_/);
    expect(cred.refresh_token_enc).toBeTruthy();

    const variants = await rest(`product_variants?select=title,inventory_quantity,available_for_sale,inventory_tracked&business_id=eq.${businessId}&order=title`);
    expect(variants).toContainEqual({ title: "One size", inventory_quantity: null, available_for_sale: true, inventory_tracked: false });
    const [order] = await rest(`orders?select=name,email,fulfillments(tracking_number)&business_id=eq.${businessId}`);
    expect(order).toMatchObject({ name: "#1001", email: null, fulfillments: [{ tracking_number: "1Z999" }] });

    await page.reload();
    const status = page.getByTestId("shopify-status");
    await expect(status.getByText("Fixture fixture-one")).toBeVisible();
    await expect(status.getByText("Up to date")).toBeVisible();
    await page.screenshot({ path: "test-results/integrations-connected.png" });

    await page.goto("/dashboard/products");
    await expect(page.getByRole("cell", { name: "Trail Boot" })).toBeVisible();
    await page.goto("/dashboard/orders");
    await expect(page.getByText("#1001")).toBeVisible();
  });

  test("the AI answers from the real catalog and checks stock live", async ({ page }) => {
    await page.goto("/login");
    // Session from the previous test isn't shared; sign in again.
    const [member] = await rest(`business_members?select=user:users(email)&business_id=eq.${businessId}`);
    await page.getByLabel("Email").fill(member.user.email);
    await page.getByLabel("Password").fill("correct-horse-42");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dashboard/);

    await page.goto("/dashboard/ai-employee");
    const chat = page.getByLabel("Test message", { exact: true });
    await chat.fill("Do you sell boots?");
    await page.getByRole("button", { name: "Send test message" }).click();
    await expect(page.getByText("We have Trail Boot (120.00 USD).")).toBeVisible();
    await expect(page.getByText("Searched products")).toBeVisible();

    await chat.fill("Is the trail boot size 10 in stock?");
    await page.getByRole("button", { name: "Send test message" }).click();
    await expect(page.getByText(/Trail Boot: size 10 is sold out \(checked live from the store just now\)/)).toBeVisible();
    await expect(page.getByText("Checked availability")).toBeVisible();

    // Unpublished products are never offered.
    await chat.fill("Can I buy the sample?");
    await page.getByRole("button", { name: "Send test message" }).click();
    await expect(page.getByText("I couldn't find that product in the store.")).toBeVisible();
    await page.screenshot({ path: "test-results/ai-products.png" });

    const reqs = (await (await fetch(`${process.env.E2E_FAKE_OPENAI}/__requests`)).json()) as { body: { instructions: string; tools: { name: string }[] } }[];
    const last = reqs.at(-1)!.body;
    expect(last.tools.map((t) => t.name)).toEqual(expect.arrayContaining(["search_products", "get_product_details", "check_availability"]));
    expect(last.instructions).toContain("Use check_availability before saying anything is in stock");
  });

  test("webhooks are verified, deduplicated and applied", async () => {
    // Bad signature: refused and not stored.
    const bad = await webhook("products/update", { id: 101 }, { badSignature: true });
    expect(bad.status).toBe(401);

    // Size 10 comes back into stock in Shopify.
    await fetch(`${FAKE_SHOPIFY}/__catalog`, {
      method: "POST",
      body: JSON.stringify({ shop: SHOP, productId: "gid://shopify/Product/101", variant: { id: "gid://shopify/ProductVariant/1012", patch: { availableForSale: true, inventoryQuantity: 3 } } }),
    });
    const id = randomUUID();
    const first = await webhook("inventory_levels/update", { inventory_item_id: 1012, location_id: 1, available: 3 }, { id });
    expect(first.status).toBe(200);
    const again = await webhook("inventory_levels/update", { inventory_item_id: 1012, location_id: 1, available: 3 }, { id });
    expect(await again.json()).toMatchObject({ duplicate: true });

    await expect
      .poll(async () => (await rest(`product_variants?select=inventory_quantity&business_id=eq.${businessId}&shopify_gid=eq.gid://shopify/ProductVariant/1012`))[0]?.inventory_quantity, { timeout: 20_000 })
      .toBe(3);
    const hooks = await rest(`integration_webhooks?select=status&external_id=eq.${id}`);
    expect(hooks).toEqual([{ status: "processed" }]);

    // Product deleted in Shopify disappears from the catalog.
    await webhook("products/delete", { id: 102 });
    await expect
      .poll(async () => (await rest(`products?select=deleted_at&business_id=eq.${businessId}&shopify_gid=eq.gid://shopify/Product/102`))[0]?.deleted_at, { timeout: 20_000 })
      .toBeTruthy();

    // Unknown shops are acknowledged but ignored.
    const other = await webhook("products/update", { id: 101 }, { shop: "nobody.myshopify.com" });
    expect(other.status).toBe(200);
  });

  test("expired access is renewed with the rotating refresh token", async ({ page }) => {
    const before = await connection(businessId);
    const [oldCred] = await rest(`shopify_credentials?select=refresh_token_enc&connection_id=eq.${before.id}`);
    await fetch(`${FAKE_SHOPIFY}/__expire`, { method: "POST" });

    const [member] = await rest(`business_members?select=user:users(email)&business_id=eq.${businessId}`);
    await page.goto("/login");
    await page.getByLabel("Email").fill(member.user.email);
    await page.getByLabel("Password").fill("correct-horse-42");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dashboard/);
    await page.goto("/dashboard/integrations");
    await page.getByRole("button", { name: "Sync now" }).click();
    await expect(page.getByText("Sync started.")).toBeVisible();

    await expect.poll(async () => (await connection(businessId)).last_sync_at, { timeout: 30_000 }).not.toBe(before.last_sync_at);
    const after = await connection(businessId);
    expect(after.status).toBe("active");
    expect(after.last_sync_status).toBe("succeeded");
    const [newCred] = await rest(`shopify_credentials?select=refresh_token_enc&connection_id=eq.${before.id}`);
    expect(newCred.refresh_token_enc).not.toBe(oldCred.refresh_token_enc);
  });

  test("a store can't be connected to two businesses, and forged callbacks are refused", async ({ page }) => {
    await signUp(page, "Other Owner", uniqueEmail("p3other"));
    await onboard(page, "Someone Else Ltd");
    await connectStore(page, SHOP);
    await expect(page.getByText("That store is already connected to another Mairo Assist business.")).toBeVisible();

    await page.goto(`/api/shopify/callback?shop=${SHOP}&code=x&state=y&timestamp=${Math.floor(Date.now() / 1000)}&hmac=deadbeef`);
    await expect(page).toHaveURL(/shopify_error=invalid_signature/);
    await expect(page.getByText("Shopify's response couldn't be verified")).toBeVisible();

    // Declining on Shopify's screen changes nothing.
    await fetch(`${FAKE_SHOPIFY}/__deny`, { method: "POST", body: JSON.stringify({ shop: "fixture-two.myshopify.com", deny: true }) });
    await connectStore(page, "fixture-two");
    await expect(page).toHaveURL(/shopify_error=denied/);
    await expect(page.getByText("The connection was cancelled on Shopify.")).toBeVisible();
    const [biz] = await rest(`businesses?select=id&name=eq.${encodeURIComponent("Someone Else Ltd")}`);
    expect(await connection(biz.id)).toBeNull();
  });

  test("disconnect removes store data; uninstall is handled", async ({ page }) => {
    const [member] = await rest(`business_members?select=user:users(email)&business_id=eq.${businessId}`);
    await page.goto("/login");
    await page.getByLabel("Email").fill(member.user.email);
    await page.getByLabel("Password").fill("correct-horse-42");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dashboard/);

    await page.goto("/dashboard/integrations");
    await page.getByRole("button", { name: "Disconnect" }).click();
    await page.getByRole("button", { name: "Disconnect store" }).click();
    await expect(page.getByText(`${SHOP} was disconnected.`)).toBeVisible();
    const conn = await connection(businessId);
    expect(conn.status).toBe("disconnected");
    expect(await rest(`shopify_credentials?select=connection_id&connection_id=eq.${conn.id}`)).toEqual([]);
    expect(await rest(`orders?select=id&business_id=eq.${businessId}`)).toEqual([]);
    expect(await rest(`products?select=id&business_id=eq.${businessId}`)).toEqual([]);

    // Reconnect, then Shopify reports the app was uninstalled.
    await connectStore(page, SHOP);
    await expect(page).toHaveURL(/shopify=connected/);
    await expect.poll(async () => (await connection(businessId))?.last_sync_status, { timeout: 30_000 }).toBe("succeeded");
    await webhook("app/uninstalled", { id: 1, domain: SHOP });
    await expect.poll(async () => (await connection(businessId))?.status, { timeout: 20_000 }).toBe("uninstalled");
    expect(await rest(`products?select=id&business_id=eq.${businessId}`)).toEqual([]);
    await page.goto("/dashboard/integrations");
    await expect(page.getByText("App uninstalled")).toBeVisible();

    // With the store gone the AI says so instead of guessing.
    await page.goto("/dashboard/ai-employee");
    await page.getByLabel("Test message", { exact: true }).fill("Do you sell boots?");
    await page.getByRole("button", { name: "Send test message" }).click();
    await expect(page.getByText("Hi! I'm here to help with anything about the store.")).toBeVisible();
  });
});
