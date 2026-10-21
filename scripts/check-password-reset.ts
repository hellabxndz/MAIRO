// "Forgot your password?", checked against the database with a pretend email
// provider — nothing is sent anywhere:
//
//   - with no provider configured the page says to email support, and no link is made;
//   - the answer is the same for an address with no account, which gets no email;
//   - a link is emailed to the account's own address, stored only as a hash,
//     good for an hour and for one use, and a new password spends every link;
//   - a link that couldn't be sent can't be used; requests are rate-limited;
//   - the sign-in page links to it and the reset page leaks no referrer.
//
//   npm run check:password-reset   (needs DATABASE_URL; makes no network calls)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { withEmailTransport } from "../src/lib/email/send";
import { requestPasswordReset, resetLinkValid, resetPassword, sweepPasswordResets, RESET_INVALID_MESSAGE, RESET_LIMIT_MESSAGE, RESET_TTL_MS } from "../src/lib/password-reset";
import { RESET_REQUESTS_PER_ACCOUNT } from "../src/lib/login-throttle";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "zz-reset";
const EMAIL = `${TAG}-owner@example.test`;
const OLD = "old-password-42";
// Every window here is in 2032, far from any real usage counter.
const at = (minutes: number) => new Date(Date.UTC(2032, 0, 5, 10, 0) + minutes * 60_000);

type Sent = { to: string[]; subject: string; text: string };
async function capture<T>(fn: () => Promise<T>, ok = true): Promise<{ result: T; sent: Sent[] }> {
  const sent: Sent[] = [];
  const result = await withEmailTransport(async (body) => {
    sent.push(body as unknown as Sent);
    return { ok, status: ok ? 200 : 422 };
  }, fn);
  return { result, sent };
}
const tokenFrom = (text: string) => /\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? "";

async function cleanup() {
  await db.passwordReset.deleteMany({ where: { user: { email: { startsWith: TAG } } } });
  await db.user.deleteMany({ where: { email: { startsWith: TAG } } });
  await db.toolUsage.deleteMany({ where: { bucket: { startsWith: "reset:" }, windowStart: { gte: at(-600) } } });
}

async function main() {
  await cleanup();
  const user = await db.user.create({ data: { email: EMAIL, passwordHash: await bcrypt.hash(OLD, 10), name: "Reset Test" } });
  try {
    console.log("No email provider:");
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    await check("the request says to email support, and no link is made", async () => {
      const { result, sent } = await capture(() => requestPasswordReset(EMAIL, "203.0.113.1", at(0)));
      assert.equal(result.ok, false);
      assert.match(!result.ok ? result.error : "", /^Email .+@.+ from your account's address/);
      assert.equal(sent.length, 0);
      assert.equal(await db.passwordReset.count({ where: { userId: user.id } }), 0);
    });

    console.log("With a provider:");
    process.env.RESEND_API_KEY = "re_test_placeholder";
    process.env.EMAIL_FROM = "MAIRO <account@example.test>";
    await check("an address with no account gets the same answer and no email", async () => {
      const { result, sent } = await capture(() => requestPasswordReset(`${TAG}-nobody@example.test`, "203.0.113.2", at(0)));
      assert.deepEqual(result, { ok: true });
      assert.equal(sent.length, 0);
    });

    let token = "";
    await check("the account's own address gets one link, whatever capitalisation was typed", async () => {
      const { result, sent } = await capture(() => requestPasswordReset(EMAIL.toUpperCase(), "203.0.113.3", at(0)));
      assert.deepEqual(result, { ok: true });
      assert.equal(sent.length, 1);
      assert.deepEqual(sent[0].to, [EMAIL]);
      assert.equal(sent[0].subject, "Reset your MAIRO password");
      token = tokenFrom(sent[0].text);
      assert.ok(token.length >= 40, "a long random token");
      assert.match(sent[0].text, /within the next hour/);
    });

    await check("only a hash of the token is stored, and it expires in an hour", async () => {
      const rows = await db.passwordReset.findMany({ where: { userId: user.id } });
      assert.equal(rows.length, 1);
      assert.notEqual(rows[0].tokenHash, token);
      assert.ok(!rows.some((r) => r.tokenHash.includes(token)));
      assert.equal(rows[0].expiresAt.getTime() - at(0).getTime(), RESET_TTL_MS);
      assert.equal(await resetLinkValid(token, at(1)), true);
      assert.equal(await resetLinkValid(token, at(61)), false, "expired after an hour");
      assert.equal(await resetLinkValid("not-a-token", at(1)), false);
    });

    await check("a weak, mismatched or expired new password is refused and changes nothing", async () => {
      assert.equal((await resetPassword(token, "short", "short", at(5)) as { field?: string }).field, "password");
      assert.equal((await resetPassword(token, "new-password-77", "new-password-78", at(5)) as { field?: string }).field, "confirm");
      assert.deepEqual(await resetPassword(token, "new-password-77", "new-password-77", at(61)), { ok: false, error: RESET_INVALID_MESSAGE });
      const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      assert.ok(await bcrypt.compare(OLD, u.passwordHash!));
    });

    let second = "";
    await check("a new password works once, and spends every outstanding link", async () => {
      second = tokenFrom((await capture(() => requestPasswordReset(EMAIL, "203.0.113.3", at(10)))).sent[0].text);
      const r = await resetPassword(token, "new-password-77", "new-password-77", at(11));
      assert.deepEqual(r, { ok: true, email: EMAIL });
      const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      assert.ok(await bcrypt.compare("new-password-77", u.passwordHash!));
      assert.ok(!(await bcrypt.compare(OLD, u.passwordHash!)));
      assert.deepEqual(await resetPassword(token, "another-pass-99", "another-pass-99", at(12)), { ok: false, error: RESET_INVALID_MESSAGE }, "same link twice");
      assert.deepEqual(await resetPassword(second, "another-pass-99", "another-pass-99", at(12)), { ok: false, error: RESET_INVALID_MESSAGE }, "the other link");
    });

    await check("a link the provider refused to send can't be used", async () => {
      const before = await db.passwordReset.count({ where: { userId: user.id } });
      const { result, sent } = await capture(() => requestPasswordReset(EMAIL, "203.0.113.4", at(20)), false);
      assert.deepEqual(result, { ok: true });
      assert.equal(sent.length, 1);
      assert.equal(await db.passwordReset.count({ where: { userId: user.id } }), before);
    });

    await check(`at most ${RESET_REQUESTS_PER_ACCOUNT} requests an hour per account`, async () => {
      // Three already this hour (at 0, 10 and 20 minutes).
      const { result, sent } = await capture(() => requestPasswordReset(EMAIL, "203.0.113.5", at(30)));
      assert.deepEqual(result, { ok: false, error: RESET_LIMIT_MESSAGE });
      assert.equal(sent.length, 0);
      const next = await capture(() => requestPasswordReset(EMAIL, "203.0.113.5", at(61)));
      assert.equal(next.sent.length, 1, "allowed again the next hour");
    });

    await check("the daily sweep deletes links older than a day", async () => {
      await db.passwordReset.updateMany({ where: { userId: user.id }, data: { createdAt: new Date(Date.now() - 2 * 86_400_000) } });
      await sweepPasswordResets();
      assert.equal(await db.passwordReset.count({ where: { userId: user.id } }), 0);
    });

    console.log("Pages:");
    await check("sign-in links to it; the reset page sends no referrer and isn't indexed", () => {
      assert.match(readFileSync("src/app/(auth)/sign-in/sign-in-form.tsx", "utf8"), /href="\/forgot-password"[\s\S]*Forgot your password\?/);
      const page = readFileSync("src/app/(auth)/reset-password/page.tsx", "utf8");
      assert.match(page, /referrer: "no-referrer"/);
      assert.match(page, /robots: \{ index: false \}/);
      assert.match(readFileSync("src/app/api/cron/review/route.ts", "utf8"), /sweepPasswordResets\(\)/);
    });
  } finally {
    await cleanup();
  }
  console.log(`\n${passed} checks passed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
