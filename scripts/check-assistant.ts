// Checks the two rules that stop this product texting the wrong person.
//
// Everything else about the assistant is cosmetic — a name on a heading, a
// prompt that reads well or badly. The SMS half is not: a text goes to a real
// phone, and every one of the conditions on sending is the difference between
// a useful notification and a complaint. None of them is enforced by types, so
// they are enforced here.
//
// The send path itself is not called — it would need a database and a
// provider. What is checked is the pure part: the number normaliser (which
// decides what gets stored and therefore what gets dialled), the masking (which
// must never print a whole number back), and the prompt (which must actually
// carry the business's own name and must not go on promising results).
//
// Run with: npm run check:assistant

import { maskPhone, normalizePhone } from "@/lib/sms/send";
import {
  assistantNameOf,
  ASSISTANT_SKILLS,
  CLIENT_AGENT,
  DEFAULT_ASSISTANT_NAME,
  isClientAgent,
  systemPromptFor,
} from "@/lib/ai/agents";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  if (!cond) {
    failures++;
    console.log(`  FAIL  ${name} ${extra}`);
  } else console.log(`  ok    ${name}`);
}

console.log("\n— phone numbers —");
check("a US number typed plainly gets a country code", normalizePhone("555 123 4567") === "+15551234567");
check("punctuation is ignored", normalizePhone("(555) 123-4567") === "+15551234567");
check("a leading 1 is kept, not doubled", normalizePhone("1 555 123 4567") === "+15551234567");
check("an international number survives", normalizePhone("+44 7700 900123") === "+447700900123");
check("too short is refused", normalizePhone("12345") === null);
check("too long is refused", normalizePhone("+1234567890123456") === null);
check("letters are refused", normalizePhone("call me") === null);
// Ten bare digits are read as North American — the documented guess. The
// check is here to pin that down: it is the only input that produces a number
// the person may not have meant, and verification is what catches it.
check("ten bare digits are read as North American", normalizePhone("7700900123") === "+17700900123");
// Nine digits is neither a North American number nor anything this can place,
// so it is refused rather than dialled.
check("digits that fit no pattern are refused", normalizePhone("770090012") === null);
check("empty is refused", normalizePhone("   ") === null);

console.log("\n— masking never leaks a number —");
const full = "+15551234567";
const masked = maskPhone(full);
check("only the last four survive", masked === "••• ••• 4567", `got ${masked}`);
check("the rest of the digits are gone", !masked.includes("555123"));
check("a short string does not throw or expose", maskPhone("12") === "•••");

console.log("\n— the assistant's name —");
check("nothing stored means Alex", assistantNameOf(null) === DEFAULT_ASSISTANT_NAME);
check("an empty name means Alex", assistantNameOf("   ") === DEFAULT_ASSISTANT_NAME);
check("a real name is kept, trimmed", assistantNameOf("  Jess  ") === "Jess");
check("a silly long name is cut rather than rejected", assistantNameOf("x".repeat(200)).length === 24);

console.log("\n— one assistant, not three —");
check("the three old client types all resolve to a client agent",
  isClientAgent("STRATEGIST") && isClientAgent("CREATIVE") && isClientAgent("SUPPORT"));
check("the owner copilot is not one of them", isClientAgent("OWNER_COPILOT") === false);
check("the canonical client thread is one of the three", isClientAgent(CLIENT_AGENT));

const a = systemPromptFor("STRATEGIST", { assistantName: "Jess", businessName: "Bell Plumbing" });
const b = systemPromptFor("CREATIVE", { assistantName: "Jess", businessName: "Bell Plumbing" });
const c = systemPromptFor("SUPPORT", { assistantName: "Jess", businessName: "Bell Plumbing" });
check("all three old types now produce the same prompt", a === b && b === c);
check("the prompt answers to the chosen name", a.includes("You are Jess"));
check("and knows whose business it is", a.includes("Bell Plumbing"));
check("with no name stored it answers to Alex",
  systemPromptFor("SUPPORT", { businessName: "Bell Plumbing" }).includes(`You are ${DEFAULT_ASSISTANT_NAME}`));

console.log("\n— the prompt keeps the product's promises —");
check("it is told never to promise a result", /[Nn]ever promise a result/.test(a));
check("it is told approval is the person's", /never yours/.test(a));
check("it is told to say when it cannot see something", /cannot see it rather than guessing/.test(a));
check("it covers budget", /Budget:/.test(a));
check("it covers creative", /Creative:/.test(a));
check("it covers campaigns", /Campaigns:/.test(a));
check("it covers the product itself", /The product itself:/.test(a));

console.log("\n— the owner copilot stays separate —");
const owner = systemPromptFor("OWNER_COPILOT", { assistantName: "Jess", businessName: "Bell Plumbing" });
check("it is not the customer prompt", owner !== a);
// A customer's chosen name must not reach the internal prompt, or a business
// could name its assistant something that reads as an instruction and have it
// echoed into the operator's tool.
check("a customer's name cannot reach it", !owner.includes("Jess"));
check("and neither can their business name", !owner.includes("Bell Plumbing"));

console.log("\n— the page promises only what the prompt covers —");
check("every listed skill has a title and a body",
  ASSISTANT_SKILLS.every((s) => s.title.trim().length > 0 && s.body.trim().length > 0));
check("there are no invented performance figures in them",
  ASSISTANT_SKILLS.every((s) => !/\d+\s*%|\d+x\b/.test(s.body)));

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
