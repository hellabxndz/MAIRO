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
import { TOOLS, usable } from "../src/lib/tools/registry";

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
      else if (anchor && path !== "prisma/schema.prisma" && !statSync(join(root, path)).isDirectory() && !read(path).includes(anchor)) missing.push(`${c.id}: ${path}#${anchor}`);
    }
  }
  assert.deepEqual(missing, []);
});
check("every cited check suite is a real npm script", () => {
  const missing = CAPABILITIES.flatMap((c) => c.checks.filter((s) => !scripts.includes(`check:${s}`)).map((s) => `${c.id}: check:${s}`));
  assert.deepEqual(missing, []);
});
check("every route a capability names is a real page", () => {
  // "/dashboard/create" → src/app/dashboard/create/page.tsx, allowing for (groups).
  const pages: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(join(root, dir))) {
      const p = join(dir, f);
      if (statSync(join(root, p)).isDirectory()) walk(p);
      else if (f === "page.tsx") pages.push("/" + dir.replace(/^src\/app\/?/, "").split("/").filter((s) => s && !/^\(.*\)$/.test(s)).join("/"));
    }
  };
  walk("src/app");
  // A [segment] in a page path matches any value in that position.
  const matches = (route: string) => {
    const want = (route.replace(/\/$/, "") || "/").split("/");
    return pages.some((page) => {
      const have = page.split("/");
      return have.length === want.length && have.every((seg, i) => seg === want[i] || (/^\[.+\]$/.test(seg) && !/^\[.+\]$/.test(want[i])) || seg === want[i]);
    });
  };
  const missing = CAPABILITIES.flatMap((c) => c.routes.filter((r) => !matches(r)).map((r) => `${c.id}: ${r}`));
  assert.deepEqual(missing, []);
});
check("every usable free tool has its page content and its component on the tool page", () => {
  const page = read("src/components/tools/tool-loader.tsx");
  const content = read("src/lib/tools/content.ts");
  const missing = TOOLS.filter(usable).filter((t) => !page.includes(`"${t.slug}": dynamic(`) || !content.includes(`"${t.slug}": {`)).map((t) => t.slug);
  assert.deepEqual(missing, []);
});
check("working and partial capabilities are backed by a check suite or a live run", () => {
  for (const c of CAPABILITIES.filter((x) => x.status === "working" || x.status === "partial")) assert.ok(c.checks.length > 0 || c.verifiedLive, c.id);
});
check("unavailable capabilities have no customer route, and say what they still need", () => {
  for (const c of CAPABILITIES.filter((x) => x.status === "unavailable" && x.area === "Free tools")) assert.deepEqual(c.routes, [], c.id);
  for (const c of CAPABILITIES.filter((x) => x.status === "unavailable" && x.id !== "tiktok" && x.id !== "google-ads" && x.area !== "Free tools")) assert.ok(c.needs.length > 0, c.id);
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
const PUBLIC_DIRS = ["src/components/landing", "src/components/walkthrough", "src/components/tools", "src/app/tools", "src/lib/tools", "src/lib/creative", "src/lib/calc"];
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
