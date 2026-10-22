import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// For an uptime monitor: is the site up, and can it reach its database?
//
// 200 {"ok":true} when both are; 503 when the database doesn't answer within
// a few seconds. Public, so it says nothing else — no versions, no
// configuration, no error text.

export const dynamic = "force-dynamic";

export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const database = await Promise.race([
    db.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), 4000);
    }),
  ]).finally(() => clearTimeout(timer));
  return NextResponse.json(
    { ok: database, database: database ? "up" : "down" },
    { status: database ? 200 : 503, headers: { "cache-control": "no-store" } }
  );
}
