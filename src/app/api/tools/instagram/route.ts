import { NextResponse } from "next/server";
import { z } from "zod";
import { anonKeyFor, takeScanQuota } from "@/lib/website/store";
import { normalizeHandle, readInstagram } from "@/lib/website/instagram";

// "Analyze my Instagram" for the free plan: one read of what Instagram shows
// signed-out visitors (lib/website/instagram.ts), counted against the same
// free-reading limits as a website check. Nothing is stored: the profile's
// public name, bio and link go back to the visitor's browser, where they
// confirm or change them like anything else in the free plan.

const body = z.object({ handle: z.string().min(1).max(120) });

export async function POST(request: Request) {
  let handle: string;
  try {
    const parsed = body.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ status: "invalid", message: "Enter your Instagram username." }, { status: 400 });
    handle = parsed.data.handle;
  } catch {
    return NextResponse.json({ status: "invalid", message: "Bad request." }, { status: 400 });
  }
  if (!normalizeHandle(handle)) return NextResponse.json({ status: "invalid", message: "That doesn't look like an Instagram username. Enter it like @yourbusiness." });
  const anonKey = anonKeyFor(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, request.headers.get("user-agent"));
  const quota = await takeScanQuota({ anonKey });
  if (!quota.ok) return NextResponse.json({ status: "limit", message: quota.message }, { status: 429 });
  try {
    return NextResponse.json(await readInstagram(handle));
  } catch {
    return NextResponse.json({ status: "unavailable", handle: normalizeHandle(handle), message: "MAIRO couldn't reach Instagram just now. Tell MAIRO about your business instead — it takes a minute." });
  }
}
