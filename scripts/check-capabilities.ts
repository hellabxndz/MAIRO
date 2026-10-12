// Checks the capability inventory against the code and the public pages:
//
//   - every evidence path exists (a file, a folder, a Prisma model, a NEXT.md
//     section), and every cited check suite is a real npm script;
//   - demo and unavailable capabilities carry no public claim, and partial
//     ones state their condition;
//   - no public page carries a guarantee, testimonial, rating, customer count
//     or savings figure;
//   - docs/CAPABILITIES.md matches the inventory.
//
//   npm run check:capabilities   (pure; no database, no network)

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { BANNED_CLAIMS, CAPABILITIES, claim } from "../src/lib/capabilities";
import { renderCapabilitiesDoc } from "./capabilities-doc";

const root = new URL("..", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(root, p), "utf8");
const scripts = Object.keys((JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts);
const schema = read("prisma/schema.prisma");

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("— evidence —");
check("every capability's evidence exists in the repository", () => {
  const missing: string[] = [];
  for (const c of CAPABILITIES) {
    for (const e of c.evidence) {
      const [path, anchor] = e.split("#");
      if (!existsSync(join(root, path))) missing.push(`${c.id}: ${path}`);
      else if (path === "prisma/schema.prisma" && anchor && !new RegExp(`^model ${anchor} \\{`, "m").test(schema)) missing.push(`${c.id}: model ${anchor}`);
      else if (path.endsWith(".ts") && anchor && !read(path).includes(anchor)) missing.push(`${c.id}: ${path}#${anchor}`);
    }
  }
  assert.deepEqual(missing, []);
});
check("every cited check suite is a real npm script", () => {
  const missing = CAPABILITIES.flatMap((c) => c.checks.filter((s) => !scripts.includes(`check:${s}`)).map((s) => `${c.id}: check:${s}`));
  assert.deepEqual(missing, []);
});
check("ids are unique", () => {
  const ids = CAPABILITIES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

console.log("\n— what may be said —");
check("demo and unavailable capabilities carry no public claim", () => {
  for (const c of CAPABILITIES.filter((x) => x.status === "demo" || x.status === "unavailable")) assert.equal(c.claim, null, c.id);
  assert.throws(() => claim("tiktok"));
  assert.throws(() => claim("case-studies"));
});
check("partially working capabilities state their condition", () => {
  for (const c of CAPABILITIES.filter((x) => x.status === "partial")) assert.ok(c.condition && c.condition.length > 20, c.id);
});

console.log("\n— public pages —");
const PUBLIC_DIRS = ["src/components/landing", "src/components/walkthrough"];
const PUBLIC_FILES = ["src/app/page.tsx", "src/app/founding/page.tsx", "src/lib/pricing/compare.ts", "src/lib/walkthrough/script.ts"];
function filesIn(dir: string): string[] {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(root, p)).isDirectory() ? filesIn(p) : /\.(tsx?|vtt)$/.test(f) ? [p] : [];
  });
}
check("no public page promises results, shows ratings, testimonials, customer counts or savings figures", () => {
  const hits: string[] = [];
  for (const f of [...PUBLIC_FILES.filter((p) => existsSync(join(root, p))), ...PUBLIC_DIRS.flatMap(filesIn), ...(existsSync(join(root, "public/walkthrough")) ? readdirSync(join(root, "public/walkthrough")).filter((x) => x.endsWith(".vtt")).map((x) => `public/walkthrough/${x}`) : [])]) {
      // Comments explain the rules; only what renders counts.
    const text = read(f).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const b of BANNED_CLAIMS) if (b.pattern.test(text)) hits.push(`${f}: ${b.why} (${text.match(b.pattern)?.[0]})`);
  }
  assert.deepEqual(hits, []);
});

console.log("\n— the document —");
check("docs/CAPABILITIES.md matches the inventory (npm run capabilities:doc)", () => {
  assert.equal(read("docs/CAPABILITIES.md"), renderCapabilitiesDoc());
});

const count = (s: string) => CAPABILITIES.filter((c) => c.status === s).length;
console.log(`\nCapabilities: ${passed} checks passed — ${count("working")} working, ${count("partial")} partial, ${count("demo")} demo, ${count("unavailable")} unavailable.`);
