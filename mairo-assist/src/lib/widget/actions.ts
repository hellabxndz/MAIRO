"use server";

import { revalidatePath } from "next/cache";
import { log } from "@/lib/log";
import { ShopifyApiError, ShopifyReauthRequired } from "@/lib/shopify/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, PermissionError, type BusinessContext } from "@/lib/tenancy/context";
import type { FormState } from "@/lib/validation/form";
import { installWidget, removeWidget } from "./install";

async function manager(): Promise<BusinessContext | null> {
  try {
    return await authorize("integrations.manage");
  } catch (e) {
    if (e instanceof PermissionError) return null;
    throw e;
  }
}

async function liveConnection(businessId: string) {
  const { data } = await createAdminClient().from("shopify_connections").select("id, scopes").eq("business_id", businessId).eq("status", "active").maybeSingle();
  return data;
}

function failure(e: unknown): FormState {
  log.warn("widget.install_failed", { error: e instanceof Error ? e.message : String(e) });
  if (e instanceof ShopifyReauthRequired) return { message: "Your store needs to be reconnected first (Integrations)." };
  if (e instanceof ShopifyApiError && /permission/i.test(e.message)) return { message: "Mairo Assist needs permission to add the widget. Reconnect your store from Integrations." };
  return { message: "Shopify didn't respond as expected. Please try again." };
}

export async function installChatWidget(): Promise<FormState> {
  const ctx = await manager();
  if (!ctx) return { message: "Only people who manage integrations can change the widget." };
  const conn = await liveConnection(ctx.business.id);
  if (!conn) return { message: "Connect your Shopify store first." };
  if (!(conn.scopes as string[]).includes("write_script_tags")) return { message: "Reconnect your store once to give Mairo Assist permission to add the widget." };
  try {
    await installWidget(conn.id, ctx.business.id, ctx.user.id);
  } catch (e) {
    return failure(e);
  }
  revalidatePath("/dashboard/widget");
  return { ok: true, message: "The chat widget is on your store." };
}

export async function removeChatWidget(): Promise<FormState> {
  const ctx = await manager();
  if (!ctx) return { message: "Only people who manage integrations can change the widget." };
  const conn = await liveConnection(ctx.business.id);
  if (!conn) return { message: "No store is connected." };
  try {
    await removeWidget(conn.id, ctx.business.id, ctx.user.id);
  } catch (e) {
    return failure(e);
  }
  revalidatePath("/dashboard/widget");
  return { ok: true, message: "The chat widget was removed from your store." };
}
