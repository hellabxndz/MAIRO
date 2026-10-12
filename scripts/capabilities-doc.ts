// Writes docs/CAPABILITIES.md from src/lib/capabilities.ts, so the document
// owners read and the list the code checks are the same thing.
//
//   npm run capabilities:doc

import { writeFileSync } from "node:fs";
import { CAPABILITIES, type CapabilityStatus } from "../src/lib/capabilities";

const LABEL: Record<CapabilityStatus, string> = {
  working: "Working",
  partial: "Partially working",
  demo: "Demo only",
  unavailable: "Unavailable",
};

export function renderCapabilitiesDoc(): string {
  const out: string[] = [
    "# MAIRO capability matrix",
    "",
    "Generated from `src/lib/capabilities.ts` and `src/lib/tools/registry.ts` by `npm run capabilities:doc` — edit those, not this file.",
    "Statuses come from the code and its checks, not from what was requested.",
    "`npm run check:capabilities` fails if any evidence below is missing, a cited check doesn't exist,",
    "or a public page makes a claim this inventory can't back.",
    "",
    "| Status | Meaning |",
    "| --- | --- |",
    "| Working | Built and tested; safe to advertise as it stands. |",
    "| Partially working | Works with the stated condition; advertise only with the condition attached. |",
    "| Demo only | Sample data on a public page, always labelled. |",
    "| Unavailable | Not built or switched off; never advertised. |",
    "",
  ];
  // The matrix first: one line per capability, then the detail.
  out.push("## Matrix", "", "| Area | Capability | Status | Routes | Still needs | Checks |", "| --- | --- | --- | --- | --- | --- |");
  for (const c of CAPABILITIES) {
    const cell = (xs: string[]) => (xs.length ? xs.map((x) => `\`${x}\``).join(", ") : "—");
    out.push(`| ${c.area} | ${c.name} | ${LABEL[c.status]} | ${cell(c.routes)} | ${c.needs.length ? c.needs.join("; ") : "—"} | ${cell(c.checks.map((x) => `check:${x}`))} |`);
  }
  out.push("");
  for (const status of ["working", "partial", "demo", "unavailable"] as CapabilityStatus[]) {
    const rows = CAPABILITIES.filter((c) => c.status === status);
    if (!rows.length) continue;
    out.push(`## ${LABEL[status]} (${rows.length})`, "");
    for (const c of rows) {
      out.push(`### ${c.name}`, "", `*${c.area}* · \`${c.id}\``, "", c.summary, "");
      if (c.condition) out.push(`**Condition:** ${c.condition}`, "");
      if (c.routes.length) out.push(`**Routes:** ${c.routes.map((r) => `\`${r}\``).join(", ")}`, "");
      if (c.needs.length) out.push(`**Still needs:** ${c.needs.join("; ")}`, "");
      out.push(`**Verification:** ${c.verify}`, "");
      if (c.verifiedLive) out.push(`**Verified live:** ${c.verifiedLive}`, "");
      out.push(`**Evidence:** ${c.evidence.map((e) => `\`${e}\``).join(", ")}`, "");
      if (c.checks.length) out.push(`**Checks:** ${c.checks.map((s) => `\`check:${s}\``).join(", ")}`, "");
      out.push(`**Public claim:** ${c.claim ? `“${c.claim}”` : "none — not advertised"}`, "");
    }
  }
  return out.join("\n");
}

if (process.argv[1]?.endsWith("capabilities-doc.ts")) {
  writeFileSync(new URL("../docs/CAPABILITIES.md", import.meta.url), renderCapabilitiesDoc());
  console.log("Wrote docs/CAPABILITIES.md");
}
