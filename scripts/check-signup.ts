// Checks the sign-up rules and what the sign-up page promises:
//
//   - The password rule the form shows as you type is the one the server
//     enforces: at least 8 characters, not one of the first guesses, not the
//     email address.
//   - Email addresses are stored trimmed and lower-case, so a capital letter
//     or a phone keyboard's trailing space can't make a second account.
//   - The page beside the form says the free plan needs no card, explains the
//     Starter trial from the plan's own numbers, and links the Terms and
//     Privacy policy the account is created under.
//
//   npm run check:signup   (pure; no database, no network)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PASSWORD_MAX, PASSWORD_MIN, normalizeEmail, passwordProblem } from "../src/lib/auth-rules/password";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("— passwords —");
check(`at least ${PASSWORD_MIN} characters, at most ${PASSWORD_MAX}`, () => {
  assert.match(passwordProblem("short1") ?? "", /at least 8/);
  assert.equal(passwordProblem("tulip-river-42"), null);
  assert.match(passwordProblem("x".repeat(PASSWORD_MAX + 1) + "y") ?? "", /or fewer/);
});
check("the first guesses and one repeated character are refused", () => {
  for (const p of ["password", "Password1", "12345678", "qwerty123", "iloveyou"]) assert.ok(passwordProblem(p), p);
  assert.match(passwordProblem("aaaaaaaaaa") ?? "", /repeated/);
});
check("the email address can't be the password", () => {
  assert.match(passwordProblem("Jane@Shop.com", "jane@shop.com") ?? "", /email/);
  assert.equal(passwordProblem("Jane@Shop.com-2026", "jane@shop.com"), null);
});

console.log("\n— email addresses —");
check("stored trimmed and lower-case", () => {
  assert.equal(normalizeEmail("  Jane.Diaz@Shop.COM "), "jane.diaz@shop.com");
});

console.log("\n— the sign-up page —");
const page = readFileSync(new URL("../src/app/(auth)/sign-up/page.tsx", import.meta.url), "utf8");
const form = readFileSync(new URL("../src/app/(auth)/sign-up/sign-up-form.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("../src/lib/actions/auth-actions.ts", import.meta.url), "utf8");
check("says what happens next, in the product's order", () => {
  const order = ["Tell MAIRO about your business", "Get your free advertising plan", "Edit and approve the strategy", "Connect Meta and choose a plan", "Review and authorize the launch"];
  let at = -1;
  for (const step of order) {
    const i = page.indexOf(step);
    assert.ok(i > at, step);
    at = i;
  }
});
check("no card for the free plan; the trial comes from the plan's own numbers", () => {
  assert.match(page, /Your free plan needs no credit card/);
  assert.match(page, /STARTER_TRIAL_DAYS/);
  assert.match(page, /starter\.priceMonthly/);
  assert.doesNotMatch(page, /7-day|\$149/);
});
check("the form links the Terms and Privacy policy, and keeps what was typed", () => {
  assert.match(form, /href="\/terms"/);
  assert.match(form, /href="\/privacy"/);
  assert.match(form, /defaultValue=\{state\?\.values\?\.email\}/);
  assert.match(actions, /values: \{ email \}/);
});
check("the server checks the same password rule and finds existing accounts in any case", () => {
  assert.match(actions, /passwordProblem\(parsed\.data\.password, parsed\.data\.email\)/);
  assert.match(actions, /mode: "insensitive"/);
});

console.log(`\nSign-up: ${passed} checks passed`);
