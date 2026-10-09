import Link from "next/link";
import { gatherCoachInput } from "@/lib/coach/gather";
import { diagnose } from "@/lib/coach/diagnose";
import type { CoachResult, Funnel } from "@/lib/coach/types";

// The journey at a glance: what was spent, what came in, and what became of
// it — each number labelled with where it came from. A number the business
// doesn't track isn't shown as zero; it isn't shown, and "What MAIRO can't
// see yet" says how to add it.

type Tile = { label: string; value: string; source: "Meta" | "You marked" | "You entered" | "Your estimate" | "MAIRO counted"; hint: string; before?: string | null; tone?: "good" | "bad" | null };

const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: c >= 100_000 ? 0 : 2 });

/** "Was X the two weeks before", coloured only where better and worse are clear. */
function delta(now: number | null, before: number | null, betterWhen: "lower" | "higher" | null, show: (v: number) => string = String): { before: string | null; tone: Tile["tone"] } {
  if (now === null || before === null) return { before: null, tone: null };
  if (now === before) return { before: "the same as the two weeks before", tone: null };
  const ch = before === 0 ? 1 : (now - before) / before;
  const good = betterWhen === null || Math.abs(ch) < 0.05 ? null : (betterWhen === "lower") === now < before;
  return { before: `was ${show(before)} the two weeks before`, tone: good === null ? null : good ? "good" : "bad" };
}

export function tilesFor(cur: Funnel, prev: Funnel): Tile[] {
  const tiles: Tile[] = [];
  if (cur.spendCents !== null) tiles.push({ label: "Advertising spend", value: money(cur.spendCents), source: "Meta", hint: "What Meta charged for MAIRO's campaigns.", ...delta(cur.spendCents, prev.spendCents, null, money) });
  if (cur.leadSource === "recorded")
    tiles.push({ label: "Leads", value: String(cur.leads), source: "MAIRO counted", hint: `Enquiries MAIRO stored, minus spam.${cur.metaLeads !== null ? ` Meta reported ${cur.metaLeads}.` : ""}`, ...delta(cur.leads, prev.leads, "higher") });
  else if (cur.metaLeads !== null) tiles.push({ label: "Leads", value: String(cur.metaLeads), source: "Meta", hint: "What Meta reported. None is stored in MAIRO, so what became of them isn't known.", ...delta(cur.metaLeads, prev.metaLeads, "higher") });
  if (cur.judged > 0) tiles.push({ label: "Good leads", value: String(cur.qualified), source: "You marked", hint: `${cur.judged} of ${cur.leads} marked so far.`, ...delta(cur.qualified, prev.qualified, "higher") });
  if (cur.appointments > 0 || prev.appointments > 0) tiles.push({ label: "Appointments booked", value: String(cur.appointments), source: "You marked", hint: "Marked booked or any later stage.", ...delta(cur.appointments, prev.appointments, "higher") });
  if (cur.customers > 0 || prev.customers > 0) tiles.push({ label: "Customers", value: String(cur.customers), source: "You marked", hint: "Leads you marked as customers.", ...delta(cur.customers, prev.customers, "higher") });
  if (cur.costPerQualifiedCents !== null) tiles.push({ label: "Cost per good lead", value: money(cur.costPerQualifiedCents), source: "MAIRO counted", hint: "Spend ÷ leads you marked good.", ...delta(cur.costPerQualifiedCents, prev.costPerQualifiedCents, "lower", money) });
  else if (cur.costPerLeadCents !== null) tiles.push({ label: "Cost per lead", value: money(cur.costPerLeadCents), source: "MAIRO counted", hint: "Spend ÷ leads. Mark your leads to see cost per good lead.", ...delta(cur.costPerLeadCents, prev.costPerLeadCents, "lower", money) });
  if (cur.cacCents !== null) tiles.push({ label: "Cost per customer", value: money(cur.cacCents), source: "MAIRO counted", hint: "Spend ÷ customers you marked.", ...delta(cur.cacCents, prev.cacCents, "lower", money) });
  if (cur.verifiedRevenueCents !== null) tiles.push({ label: "Confirmed sales", value: money(cur.verifiedRevenueCents), source: "You entered", hint: "What you said customers' jobs were worth.", ...delta(cur.verifiedRevenueCents, prev.verifiedRevenueCents, "higher", money) });
  if (cur.roasVerified !== null) tiles.push({ label: "Return on ad spend", value: `${cur.roasVerified.toFixed(1)}×`, source: "You entered", hint: "Confirmed sales ÷ spend.", ...delta(cur.roasVerified, prev.roasVerified, "higher", (v) => `${v.toFixed(1)}×`) });
  else if (cur.roasReported !== null) tiles.push({ label: "Return Meta reports", value: `${cur.roasReported.toFixed(1)}×`, source: "Meta", hint: "Sales Meta attributes to the ads ÷ spend. Meta's estimate, not verified.", ...delta(cur.roasReported, prev.roasReported, "higher", (v) => `${v.toFixed(1)}×`) });
  if (cur.estimatedValueCents !== null) tiles.push({ label: "Open estimates", value: money(cur.estimatedValueCents), source: "Your estimate", hint: "What you expect open estimates to be worth. Not revenue." });
  return tiles;
}

const SOURCE_CLASS: Record<Tile["source"], string> = {
  Meta: "bg-blue/10 text-blue-bright",
  "You marked": "bg-violet/10 text-violet-bright",
  "You entered": "bg-violet/10 text-violet-bright",
  "Your estimate": "bg-warn/10 text-warn",
  "MAIRO counted": "bg-white/[0.06] text-muted",
};

export function CoachTiles({ result }: { result: CoachResult }) {
  const tiles = tilesFor(result.current, result.previous);
  if (!tiles.length) return <p className="text-[14px] text-muted">Nothing has been spent and no leads have come in during the last two weeks, so there&rsquo;s nothing to follow yet.</p>;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-2xl bg-white/[0.03] p-4" title={t.hint}>
          <dt className="text-[12.5px] text-muted">{t.label}</dt>
          <dd className="mt-1 text-[24px] font-semibold tabular-nums tracking-[-0.02em] text-white">{t.value}</dd>
          <dd className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${SOURCE_CLASS[t.source]}`}>{t.source}</span>
          </dd>
          {t.before && <dd className={`mt-1.5 text-[11.5px] ${t.tone === "good" ? "text-emerald-400" : t.tone === "bad" ? "text-red-300" : "text-faint"}`}>{t.before}</dd>}
        </div>
      ))}
    </dl>
  );
}

const STAGES: { key: keyof Funnel; label: string }[] = [
  { key: "clicks", label: "Clicks" },
  { key: "leads", label: "Leads" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Good leads" },
  { key: "appointments", label: "Booked" },
  { key: "customers", label: "Customers" },
];

/** The journey as steps, each with how many reached it — only the steps that are tracked. */
export function Journey({ result, labels }: { result: CoachResult; labels: { BOOKED: string; WON: string } }) {
  const f = result.current;
  const tracked = STAGES.filter((s) => {
    const v = f[s.key];
    if (typeof v !== "number") return false;
    if (s.key === "clicks" || s.key === "leads") return true;
    if (s.key === "contacted") return f.contacted > 0;
    return f.judged > 0;
  });
  if (tracked.length < 2) return null;
  const max = Math.max(...tracked.map((s) => (f[s.key] as number) || 0), 1);
  return (
    <div>
      <ol className="grid gap-2">
        {tracked.map((s, i) => {
          const v = (f[s.key] as number) || 0;
          const prevV = i > 0 ? ((f[tracked[i - 1].key] as number) || 0) : null;
          const label = s.key === "appointments" ? labels.BOOKED : s.key === "customers" ? "Customers" : s.label;
          return (
            <li key={s.key} className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-3 text-[13px] sm:grid-cols-[140px_minmax(0,1fr)_120px]">
              <span className="text-muted">{label}</span>
              <span className="h-3 overflow-hidden rounded-full bg-white/[0.05]">
                <span className="block h-full rounded-full bg-[image:var(--mairo-ramp)]" style={{ width: `${Math.max(2, Math.round((v / max) * 100))}%` }} />
              </span>
              <span className="text-right tabular-nums text-white">
                {v}
                {prevV ? <span className="ml-1.5 text-[11.5px] text-faint">{Math.round((v / prevV) * 100)}%</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[11.5px] text-faint">The percentage is how many of the step before reached this one. Clicks come from Meta; leads are counted by MAIRO; the rest is what you marked.</p>
      {result.whereItDrops && <p className="mt-3 rounded-xl bg-violet/[0.07] px-3.5 py-2.5 text-[13.5px] text-white">{result.whereItDrops}</p>}
    </div>
  );
}

/** The live part of the page: Meta's figures and the journey, read now. */
export async function CoachLive({ organizationId }: { organizationId: string }) {
  let result: CoachResult;
  let labels: { BOOKED: string; WON: string };
  try {
    const input = await gatherCoachInput(organizationId);
    result = diagnose(input);
    labels = input.labels;
  } catch {
    return <p className="text-[14px] text-muted">MAIRO couldn&rsquo;t read your results from Meta just now. The findings below are from the last review; try again in a minute.</p>;
  }
  return (
    <div className="grid gap-6">
      <CoachTiles result={result} />
      <Journey result={result} labels={labels} />
      {result.gaps.length > 0 && (
        <div>
          <h3 className="text-[13px] font-semibold text-white">What MAIRO can&rsquo;t see yet</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {result.gaps.map((g) => (
              <li key={g.key} className="rounded-2xl border border-[color:var(--mairo-line)] px-4 py-3">
                <Link href={g.href} className="text-[13.5px] font-medium text-white hover:underline">
                  {g.title} →
                </Link>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{g.why}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
