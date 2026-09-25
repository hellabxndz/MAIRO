import "server-only";
import { recordActivity, recordAudit } from "@/lib/audit";
import { shopifyClient, type ShopifyClient } from "@/lib/shopify/client";
import { widgetScriptUrl } from "@/lib/shopify/config";
import { createAdminClient } from "@/lib/supabase/admin";

const LIST = /* GraphQL */ `
  query WidgetScriptTags { scriptTags(first: 50) { nodes { id src } } }
`;
const CREATE = /* GraphQL */ `
  mutation AddWidget($input: ScriptTagInput!) {
    scriptTagCreate(input: $input) { scriptTag { id } userErrors { field message } }
  }
`;
const DELETE = /* GraphQL */ `
  mutation RemoveWidget($id: ID!) { scriptTagDelete(id: $id) { deletedScriptTagId userErrors { field message } } }
`;

async function ourTags(client: ShopifyClient) {
  const data = await client.graphql<{ scriptTags: { nodes: { id: string; src: string }[] } }>(LIST);
  return data.scriptTags.nodes.filter((t) => /\/widget\.js(\?|$)/.test(t.src));
}

/** Add the chat widget to the store (once), replacing any older copy of our script. */
export async function installWidget(connectionId: string, businessId: string, actorUserId: string) {
  const client = await shopifyClient(connectionId, businessId);
  const src = widgetScriptUrl();
  const existing = await ourTags(client);
  for (const t of existing.filter((t) => t.src !== src)) await client.graphql(DELETE, { id: t.id });
  let gid = existing.find((t) => t.src === src)?.id;
  if (!gid) {
    const res = await client.graphql<{ scriptTagCreate: { scriptTag: { id: string } | null; userErrors: { message: string }[] } }>(CREATE, {
      input: { src, displayScope: "ONLINE_STORE", cache: false },
    });
    if (res.scriptTagCreate.userErrors.length || !res.scriptTagCreate.scriptTag) {
      throw new Error(res.scriptTagCreate.userErrors[0]?.message ?? "Shopify didn't add the widget");
    }
    gid = res.scriptTagCreate.scriptTag.id;
  }
  await createAdminClient().from("shopify_connections").update({ script_tag_gid: gid, widget_installed_at: new Date().toISOString() }).eq("id", connectionId);
  await recordAudit({ businessId, actorUserId, action: "widget.installed", targetType: "shopify_connection", targetId: connectionId });
  await recordActivity({ businessId, type: "widget_installed", summary: "The chat widget was added to your store." });
}

/** Remove our script from the store. */
export async function removeWidget(connectionId: string, businessId: string, actorUserId: string | null) {
  const client = await shopifyClient(connectionId, businessId);
  for (const t of await ourTags(client)) await client.graphql(DELETE, { id: t.id });
  await createAdminClient().from("shopify_connections").update({ script_tag_gid: null, widget_installed_at: null }).eq("id", connectionId);
  await recordAudit({ businessId, actorUserId, actorType: actorUserId ? "user" : "system", action: "widget.removed", targetType: "shopify_connection", targetId: connectionId });
}
