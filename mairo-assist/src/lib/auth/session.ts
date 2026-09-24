import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email: string;
  sessionId: string | null;
};

/**
 * The signed-in user, verified from the session JWT (getClaims validates the
 * signature). Returns null when signed out or when Supabase is not set up.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Always per-request: a signed-in page must never be prerendered.
  await connection();
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const claims = data.claims as { sub: string; email?: string; session_id?: string };
  return { id: claims.sub, email: (claims.email ?? "").toLowerCase(), sessionId: claims.session_id ?? null };
});

export async function requireUser(next = "/dashboard"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}
