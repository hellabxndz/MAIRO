// "Continue with Google": whose account a Google login opens.
//
//   npm run check:google
//
// Getting this wrong is quiet and serious. Link on an unverified address and
// anyone can walk into an account by creating a Google account with its email.
// Create when you should link and one address has two MAIRO users, each with
// half the campaigns. Neither throws; both look like a working login.
//
// The first half checks the pure rules. The second runs the real database
// side against DATABASE_URL (a local Postgres — it creates and then deletes
// its own rows) and is skipped, loudly, when no database is reachable.

import {
  MAX_ORG_NAME,
  decideGoogleSignIn,
  decodeGoogleIntent,
  encodeGoogleIntent,
  signInErrorMessage,
  type GoogleIntent,
  type GoogleProfileFacts,
} from "@/lib/google-sign-in-rules";

let bad = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) {
    bad++;
    console.log(`  FAIL ${n} ${x}`);
  } else console.log(`  ok   ${n}`);
};

const profile = (over: Partial<GoogleProfileFacts> = {}): GoogleProfileFacts => ({
  sub: "g-123",
  email: "jane@example.com",
  emailVerified: true,
  name: "Jane Diaz",
  ...over,
});
const client: GoogleIntent = { mode: "client", orgName: "Diaz Dental" };
const freelancer: GoogleIntent = { mode: "freelancer", orgName: "Diaz Media" };
const signin: GoogleIntent = { mode: "signin" };

console.log("\nrules: returning Google accounts");
{
  const d = decideGoogleSignIn({ profile: profile(), byGoogleId: { id: "u1", googleId: "g-123" }, byEmail: [], intent: null });
  ok("a linked Google account signs straight in", d.kind === "sign-in" && d.userId === "u1");
  const moved = decideGoogleSignIn({
    profile: profile({ email: "new@example.com", emailVerified: false }),
    byGoogleId: { id: "u1", googleId: "g-123" },
    byEmail: [],
    intent: signin,
  });
  ok("matched on Google's id even after the address changes", moved.kind === "sign-in" && moved.userId === "u1");
}

console.log("\nrules: linking an existing email account");
{
  const d = decideGoogleSignIn({ profile: profile(), byGoogleId: null, byEmail: [{ id: "u2", googleId: null }], intent: signin });
  ok("verified address links the existing account", d.kind === "link" && d.userId === "u2" && d.googleId === "g-123");

  for (const v of [false, undefined, "true", 1, null]) {
    const r = decideGoogleSignIn({ profile: profile({ emailVerified: v }), byGoogleId: null, byEmail: [{ id: "u2", googleId: null }], intent: signin });
    ok(`email_verified=${JSON.stringify(v)} never links`, r.kind === "refuse" && r.error === "GoogleEmailUnverified");
  }
  const unverifiedNew = decideGoogleSignIn({ profile: profile({ emailVerified: false }), byGoogleId: null, byEmail: [], intent: client });
  ok("an unverified address can't claim a new account either", unverifiedNew.kind === "refuse" && unverifiedNew.error === "GoogleEmailUnverified");

  const other = decideGoogleSignIn({ profile: profile(), byGoogleId: null, byEmail: [{ id: "u2", googleId: "g-OTHER" }], intent: signin });
  ok("an account linked to a different Google account is refused, not re-pointed", other.kind === "refuse" && other.error === "GoogleAccountMismatch");

  const two = decideGoogleSignIn({
    profile: profile(),
    byGoogleId: null,
    byEmail: [{ id: "u2", googleId: null }, { id: "u3", googleId: null }],
    intent: signin,
  });
  ok("two accounts differing only by case are refused, never guessed", two.kind === "refuse" && two.error === "GoogleAccountConflict");

  const fromSignUp = decideGoogleSignIn({ profile: profile(), byGoogleId: null, byEmail: [{ id: "u2", googleId: null }], intent: client });
  ok("a sign-up with an existing address links, never creates a second user", fromSignUp.kind === "link" && fromSignUp.userId === "u2");
}

console.log("\nrules: first-time Google users");
{
  const c = decideGoogleSignIn({ profile: profile(), byGoogleId: null, byEmail: [], intent: client });
  ok(
    "client sign-up creates a BUSINESS org and a CLIENT",
    c.kind === "create" && c.role === "CLIENT" && c.orgKind === "BUSINESS" && c.orgName === "Diaz Dental" && c.email === "jane@example.com",
  );
  const f = decideGoogleSignIn({ profile: profile(), byGoogleId: null, byEmail: [], intent: freelancer });
  ok("freelancer sign-up creates a WORKSPACE and a FREELANCER", f.kind === "create" && f.role === "FREELANCER" && f.orgKind === "WORKSPACE" && f.orgName === "Diaz Media");

  const fromSignIn = decideGoogleSignIn({ profile: profile(), byGoogleId: null, byEmail: [], intent: signin });
  ok("no account from /sign-in is sent to /sign-up, not created", fromSignIn.kind === "refuse" && fromSignIn.error === "GoogleNoAccount" && fromSignIn.page === "/sign-up");
  const lost = decideGoogleSignIn({ profile: profile(), byGoogleId: null, byEmail: [], intent: null });
  ok("a lost or expired intent cookie never creates anything", lost.kind === "refuse" && lost.error === "GoogleNoAccount");

  const noName = decideGoogleSignIn({ profile: profile(), byGoogleId: null, byEmail: [], intent: { mode: "freelancer", orgName: "   " } });
  ok("a blank studio name goes back to the studio page", noName.kind === "refuse" && noName.error === "GoogleNeedsName" && noName.page === "/for-freelancers");

  const noSub = decideGoogleSignIn({ profile: profile({ sub: "" }), byGoogleId: null, byEmail: [], intent: client });
  ok("no Google id is refused", noSub.kind === "refuse" && noSub.error === "GoogleProfileIncomplete");
  const noEmail = decideGoogleSignIn({ profile: profile({ email: null }), byGoogleId: null, byEmail: [], intent: client });
  ok("no email is refused", noEmail.kind === "refuse" && noEmail.error === "GoogleProfileIncomplete");

  const nameless = decideGoogleSignIn({ profile: profile({ name: "  " }), byGoogleId: null, byEmail: [], intent: client });
  ok("a blank Google name is stored as null", nameless.kind === "create" && nameless.name === null);
}

console.log("\nrules: the intent cookie");
{
  const back = decodeGoogleIntent(encodeGoogleIntent({ mode: "client", orgName: "  Diaz   Dental  " }));
  ok("round-trips, tidying the name", back?.mode === "client" && back.orgName === "Diaz Dental");
  const long = decodeGoogleIntent(encodeGoogleIntent({ mode: "freelancer", orgName: "x".repeat(500) }));
  ok("caps the name length", long?.orgName?.length === MAX_ORG_NAME);
  ok("garbage is ignored", decodeGoogleIntent("%%%not-base64") === null);
  ok("empty is ignored", decodeGoogleIntent("") === null && decodeGoogleIntent(undefined) === null);
  const forged = Buffer.from(JSON.stringify({ m: "owner", n: "x" })).toString("base64url");
  ok("a forged role is refused — only the two self-serve ones exist", decodeGoogleIntent(forged) === null);
}

console.log("\nrules: messages on /sign-in");
{
  ok("no error, no message", signInErrorMessage(null) === null && signInErrorMessage("") === null);
  ok("cancelling at Google is explained", /cancelled/.test(signInErrorMessage("OAuthCallbackError") ?? ""));
  for (const code of ["AccessDenied", "GoogleEmailUnverified", "GoogleAccountMismatch", "GoogleNoAccount", "GoogleNeedsName", "Configuration", "Whatever"]) {
    ok(`${code} has a sentence`, (signInErrorMessage(code) ?? "").length > 10);
  }
}

async function database() {
  console.log("\ndatabase: resolveGoogleSignIn against DATABASE_URL");
  const { db } = await import("@/lib/db");
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    console.log("  SKIPPED — no database reachable at DATABASE_URL. The rules above still ran.");
    return;
  }
  const { resolveGoogleSignIn } = await import("@/lib/google-sign-in");
  const tag = `gcheck-${Date.now()}`;
  const mail = (n: string) => `${tag}-${n}@example.com`;
  const cleanup = async () => {
    const users = await db.user.findMany({ where: { email: { startsWith: tag, mode: "insensitive" } }, select: { organizationId: true } });
    await db.user.deleteMany({ where: { email: { startsWith: tag, mode: "insensitive" } } });
    const orgIds = users.map((u) => u.organizationId).filter((x): x is string => !!x);
    await db.organization.deleteMany({ where: { id: { in: orgIds } } });
  };

  try {
    // New client.
    const r1 = await resolveGoogleSignIn(profile({ sub: `${tag}-a`, email: mail("a") }), client);
    const u1 = r1.ok ? await db.user.findUnique({ where: { id: r1.userId }, include: { organization: true } }) : null;
    ok(
      "first-time client gets an Organization and a CLIENT user with organizationId",
      !!u1 && u1.role === "CLIENT" && !!u1.organizationId && u1.organization?.kind === "BUSINESS" && u1.organization.name === "Diaz Dental",
    );
    ok("…with no password and Google's id stored", !!u1 && u1.passwordHash === null && u1.googleId === `${tag}-a`);

    const again = await resolveGoogleSignIn(profile({ sub: `${tag}-a`, email: mail("a") }), client);
    ok("signing in again returns the same user, nothing new created", again.ok && again.userId === u1?.id);
    ok("still exactly one user for that address", (await db.user.count({ where: { email: mail("a") } })) === 1);

    // New freelancer.
    const r2 = await resolveGoogleSignIn(profile({ sub: `${tag}-f`, email: mail("f") }), freelancer);
    const u2 = r2.ok ? await db.user.findUnique({ where: { id: r2.userId }, include: { organization: true } }) : null;
    ok("first-time freelancer gets a WORKSPACE and a FREELANCER", u2?.role === "FREELANCER" && u2.organization?.kind === "WORKSPACE");

    // Linking an email account, case-insensitively.
    const org = await db.organization.create({ data: { name: `${tag} existing` } });
    const existing = await db.user.create({
      data: { email: mail("Existing"), passwordHash: "x", role: "CLIENT", organizationId: org.id },
    });
    const unverified = await resolveGoogleSignIn(profile({ sub: `${tag}-e`, email: mail("existing"), emailVerified: false }), signin);
    ok("unverified Google email does not link", !unverified.ok && unverified.redirectTo.includes("GoogleEmailUnverified"));
    ok("…and leaves the account unlinked", (await db.user.findUnique({ where: { id: existing.id } }))?.googleId === null);

    const linked = await resolveGoogleSignIn(profile({ sub: `${tag}-e`, email: mail("existing") }), client);
    ok("verified Google email links the existing account (address case ignored)", linked.ok && linked.userId === existing.id);
    const after = await db.user.findUnique({ where: { id: existing.id } });
    ok("…keeping its password, role and organization", after?.passwordHash === "x" && after.role === "CLIENT" && after.organizationId === org.id);
    ok("…and creating no second user", (await db.user.count({ where: { email: { equals: mail("existing"), mode: "insensitive" } } })) === 1);

    const hijack = await resolveGoogleSignIn(profile({ sub: `${tag}-other`, email: mail("existing") }), signin);
    ok("a second Google account for the same address is refused", !hijack.ok && hijack.redirectTo.includes("GoogleAccountMismatch"));

    const nobody = await resolveGoogleSignIn(profile({ sub: `${tag}-n`, email: mail("nobody") }), signin);
    ok("no account from /sign-in creates nothing", !nobody.ok && (await db.user.count({ where: { email: mail("nobody") } })) === 0);

    // Two first-time logins for one address at once.
    const race = await Promise.all([
      resolveGoogleSignIn(profile({ sub: `${tag}-r`, email: mail("race") }), client),
      resolveGoogleSignIn(profile({ sub: `${tag}-r`, email: mail("race") }), client),
    ]);
    const raceUsers = await db.user.count({ where: { email: mail("race") } });
    ok("two simultaneous first logins make one user", raceUsers === 1 && race.every((r) => r.ok), JSON.stringify(race));
  } finally {
    await cleanup();
    await db.organization.deleteMany({ where: { name: { startsWith: tag } } });
  }
}

database()
  .catch((e) => {
    bad++;
    console.log("  FAIL database section threw", e);
  })
  .finally(() => {
    console.log(bad ? `\n${bad} FAILED` : "\nall passed");
    process.exit(bad ? 1 : 0);
  });
