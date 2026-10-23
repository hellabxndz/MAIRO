// The mobile audit: every page MAIRO serves, at phone and tablet widths, in a
// real (headless Chromium) browser. For each page and width it measures:
//
//   overflow   the page scrolls sideways (document wider than the screen)
//   offscreen  content that runs past the screen's edge — text, buttons,
//              images — not counting what sits inside a deliberate sideways
//              scroller (overflow-x: auto/scroll)
//   clipped    the same, but hidden by an overflow:hidden/clip ancestor: the
//              page doesn't scroll, yet the content is cut off. Decorative
//              shapes (aria-hidden, no text, no image) are ignored.
//   inputs     form fields under 16px text, which make iPhones zoom in
//   targets    buttons and links smaller than 44×44 (inline text links are
//              exempt, as in WCAG 2.5.8)
//
// and saves screenshots for looking at. A clean report is not the end of it:
// the screenshots are.
//
//   node scripts/mobile/audit.mjs http://localhost:3300 <out dir> [--only public,paid] [--widths 320,390] [--routes /,/pricing] [--shots 320,390]

import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:3300";
const OUT = process.argv[3] ?? "mobile-audit";
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1].split(",") : null;
};

const WIDTHS = { 320: 640, 360: 740, 375: 812, 390: 844, 393: 852, 414: 896, 430: 932, 768: 1024 };
const widths = (arg("widths") ?? Object.keys(WIDTHS)).map(Number);
const shotWidths = new Set((arg("shots") ?? ["320", "390", "768"]).map(Number));
const PASSWORD = "correct-horse-42";

const GROUPS = {
  public: {
    login: null,
    routes: ["/", "/pricing", "/preview", "/preview/example", "/help", "/help/website-tracking", "/tools", "/tools/roas-calculator", "/solutions/local-services", "/for-freelancers", "/privacy", "/terms", "/data-deletion", "/sign-in", "/sign-up", "/forgot-password", "/reset-password?token=x", "/landing/classic", "/no-such-page"],
  },
  free: {
    login: "mobile-free@example.test",
    routes: ["/plan", "/plan/activate?skip=1", "/plan/start", "/billing/return?session_id=cs_test_nope", "/dashboard"],
  },
  paid: {
    login: "mobile-paid@example.test",
    routes: [
      "/dashboard", "/dashboard/campaigns", "/dashboard/campaigns/zz-mobile-c0", "/dashboard/create", "/dashboard/creatives", "/dashboard/creatives/suggested",
      "/dashboard/creative-studio", "/dashboard/decisions", "/dashboard/analytics", "/dashboard/reports", "/dashboard/reports/monthly", "/dashboard/leads",
      "/dashboard/coach", "/dashboard/team", "/dashboard/agents", "/dashboard/mission", "/dashboard/business", "/dashboard/tracking", "/dashboard/website",
      "/dashboard/meta", "/dashboard/integrations", "/dashboard/launch", "/dashboard/health", "/dashboard/activity", "/dashboard/notifications",
      "/dashboard/settings", "/dashboard/settings/team", "/dashboard/settings/business-brain", "/dashboard/settings/businesses", "/dashboard/settings/reports",
      "/dashboard/billing", "/dashboard/billing/change", "/dashboard/billing/cancel", "/dashboard/account", "/dashboard/guide", "/dashboard/plan", "/dashboard/sales-setup",
    ],
  },
  owner: {
    login: "mobile-owner@example.test",
    routes: ["/aios", "/aios/customers", "/aios/organizations", "/aios/setup", "/aios/creatives", "/aios/meta-intelligence", "/aios/meta-check", "/aios/copilot"],
  },
};

const only = arg("only");
const onlyRoutes = arg("routes");

function analyze() {
  const vw = document.documentElement.clientWidth;
  const out = { overflow: Math.max(0, document.documentElement.scrollWidth - vw), coarse: matchMedia("(pointer: coarse)").matches, offscreen: [], clipped: [], inputs: [], targets: [] };
  const describe = (el) => {
    const cls = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 6).join(".");
    const text = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("alt") || "").trim().replace(/\s+/g, " ").slice(0, 60);
    return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls ? "." + cls : ""}${text ? ` "${text}"` : ""}`;
  };
  const hiddenByStyle = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return true;
      if (n.hasAttribute("inert") && n !== document.body) return false;
    }
    return false;
  };
  const decorative = (el) => Boolean(el.closest("[aria-hidden='true']")) || (!el.innerText?.trim() && !el.querySelector("img,video,canvas,input,button,a") && !/^(IMG|VIDEO|CANVAS|INPUT|BUTTON|A|SELECT|TEXTAREA)$/.test(el.tagName));
  // The nearest ancestor that clips sideways — but a sideways scroller anywhere
  // above wins: content inside a swipeable row is reachable, whatever clips it
  // on the way (a card's rounded corners, say).
  const clipper = (el) => {
    let first = null;
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll") return { el: p, scroll: true };
      if (ox !== "visible" && !first) first = { el: p, scroll: false };
    }
    return first;
  };
  const fixedOffscreen = (el) => {
    // A closed drawer slid off the side: fixed, and wholly outside the screen.
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (getComputedStyle(n).position === "fixed") {
        const r = n.getBoundingClientRect();
        return r.right <= 0 || r.left >= vw;
      }
    }
    return false;
  };
  const seen = new Set();
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("nextjs-portal, script, style, noscript, template")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    if (hiddenByStyle(el) || fixedOffscreen(el) || decorative(el)) continue;
    const c = clipper(el);
    if (c?.scroll) {
      const cr = c.el.getBoundingClientRect();
      if (cr.right <= vw + 1 && cr.left >= -1) continue; // inside a sideways scroller that itself fits
    }
    // Report the outermost offender only.
    let parentAlso = false;
    for (let p = el.parentElement; p; p = p.parentElement) if (seen.has(p)) { parentAlso = true; break; }
    seen.add(el);
    if (parentAlso) continue;
    const entry = `${describe(el)} [${Math.round(r.left)}→${Math.round(r.right)} of ${vw}]`;
    if (c && !c.scroll) {
      // Cut off by a hidden/clip ancestor. Only a problem when the clipping happens at the screen edge.
      const cr = c.el.getBoundingClientRect();
      if (r.right > Math.min(cr.right, vw) + 1 || r.left < Math.max(cr.left, 0) - 1) out.clipped.push(entry);
    } else out.offscreen.push(entry);
  }
  for (const el of document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=submit]):not([type=button]), select, textarea")) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || hiddenByStyle(el) || el.closest("[inert]")) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 16) out.inputs.push(`${describe(el)} ${fs}px`);
  }
  for (const el of document.querySelectorAll("a[href], button, [role=button], [role=tab], summary, input[type=checkbox], input[type=radio], select")) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || hiddenByStyle(el) || el.closest("[inert], [aria-hidden='true']")) continue;
    // Inline links in running text are exempt.
    if (el.tagName === "A" && getComputedStyle(el).display === "inline" && el.parentElement && /^(P|LI|SPAN|SMALL|DD|TD|LABEL)$/.test(el.parentElement.tagName) && (el.parentElement.innerText || "").trim().length > (el.innerText || "").trim().length + 8) continue;
    // A visually hidden radio/checkbox inside a big label is fine: measure the label.
    const box = (el.tagName === "INPUT" && el.closest("label")) ? el.closest("label").getBoundingClientRect() : r;
    if (box.height < 32 || box.width < 32) out.targets.push(`${describe(el)} ${Math.round(box.width)}×${Math.round(box.height)}`);
  }
  out.offscreen = out.offscreen.slice(0, 12);
  out.clipped = out.clipped.slice(0, 12);
  out.inputs = [...new Set(out.inputs)].slice(0, 12);
  out.targetCount = out.targets.length;
  out.targets = [...new Set(out.targets)].slice(0, 10);
  return out;
}

// One sign-in per account for the whole run, its session reused by every
// width: MAIRO limits sign-in attempts, and a run of 8 widths would hit it.
const sessions = new Map();
async function signIn(context, email) {
  if (sessions.has(email)) {
    await context.addCookies(sessions.get(email));
    return;
  }
  const page = await context.newPage();
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 60_000, waitUntil: "commit" });
  sessions.set(email, await context.cookies());
  await page.close();
}

const slug = (r) => (r === "/" ? "home" : r.replace(/^\//, "").replace(/[/?=&]/g, "_"));

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const report = [];
  for (const [group, def] of Object.entries(GROUPS)) {
    if (only && !only.includes(group)) continue;
    for (const w of widths) {
      const context = await browser.newContext({ viewport: { width: w, height: WIDTHS[w] ?? 800 }, deviceScaleFactor: 2, isMobile: w <= 1024, hasTouch: true, reducedMotion: "reduce" });
      if (def.login) await signIn(context, def.login);
      const page = await context.newPage();
      for (const route of def.routes) {
        if (onlyRoutes && !onlyRoutes.includes(route)) continue;
        let status = 0;
        try {
          const res = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 45_000 }).catch(async () => page.goto(BASE + route, { waitUntil: "load", timeout: 45_000 }));
          status = res?.status() ?? 0;
          await page.waitForTimeout(400);
        } catch (e) {
          report.push({ group, route, w, error: String(e).slice(0, 200) });
          continue;
        }
        const finalPath = new URL(page.url()).pathname;
        const a = await page.evaluate(analyze);
        const entry = { group, route, w, status, landed: finalPath, ...a };
        report.push(entry);
        const bad = a.overflow > 0 || a.offscreen.length || a.clipped.length || a.inputs.length;
        console.log(`${bad ? "✗" : "✓"} ${String(w).padStart(3)} ${group.padEnd(6)} ${route}${finalPath !== route.split("?")[0] ? ` → ${finalPath}` : ""}  overflow ${a.overflow} · offscreen ${a.offscreen.length} · clipped ${a.clipped.length} · inputs<16 ${a.inputs.length} · small targets ${a.targetCount}${a.coarse ? "" : " · NOT A TOUCH SCREEN"}`);
        if (shotWidths.has(w)) {
          mkdirSync(join(OUT, String(w)), { recursive: true });
          await page.screenshot({ path: join(OUT, String(w), `${group}-${slug(route)}.png`), fullPage: true, timeout: 60_000 }).catch(() => {});
        }
      }
      await context.close();
    }
  }
  await browser.close();
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  const failing = report.filter((r) => r.error || r.overflow > 0 || r.offscreen?.length || r.clipped?.length || r.inputs?.length);
  console.log(`\n${report.length} page loads, ${failing.length} with a problem. Report: ${join(OUT, "report.json")}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
