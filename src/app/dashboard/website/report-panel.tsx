"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Finding } from "@/lib/website/audit";
import type { ScanResult } from "@/lib/website/scan";
import { setWebsiteFindingAction } from "@/lib/actions/website-actions";
import { useWebsiteScan } from "@/components/tools/use-website-scan";
import { Coverage, FactsList, FindingCard, ScanError, ScanProgressView } from "@/components/tools/website-report";
import { primaryBtn, secondaryBtn } from "@/components/tools/ui";

type Decision = { status: "OPEN" | "RESOLVED" | "DISMISSED"; resolvedAt: string | null; goneAt: string | null };

export function WebsiteReportPanel({ website, scan, decisions, gone }: { website: string; scan: { result: ScanResult; at: string } | null; decisions: Record<string, Decision>; gone: { key: string; at: string }[] }) {
  const router = useRouter();
  const { state, run } = useWebsiteScan();
  const [pending, start] = useTransition();
  const [local, setLocal] = useState<Record<string, Decision["status"]>>({});
  const result = scan?.result ?? null;
  const ok = result && (result.status === "OK" || result.status === "PARTIAL");
  const statusOf = (key: string) => local[key] ?? decisions[key]?.status ?? "OPEN";
  const mark = (f: Finding, resolved: boolean) => {
    const status = resolved ? "RESOLVED" : "OPEN";
    setLocal((x) => ({ ...x, [f.key]: status }));
    start(async () => {
      const r = await setWebsiteFindingAction({ key: f.key, status });
      if (!r.ok) setLocal((x) => ({ ...x, [f.key]: resolved ? "OPEN" : "RESOLVED" }));
    });
  };
  const recheck = async () => {
    const r = await run({ url: website, account: true, recheck: Boolean(scan) });
    if (r) router.refresh();
  };
  const top = ok ? result.audit.top : [];
  const rest = ok ? result.audit.findings.filter((f) => !top.some((t) => t.key === f.key)) : [];
  const card = (f: Finding) => (
    <div key={f.key}>
      <FindingCard f={f} resolved={statusOf(f.key) === "RESOLVED"} onResolve={f.status === "issue" ? (r) => mark(f, r) : undefined} />
      {statusOf(f.key) === "RESOLVED" && <p className="mt-1 px-1 text-[12px] text-amber-200">You marked this resolved, but the last check still saw it. Recheck after you change the page.</p>}
    </div>
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={scan ? secondaryBtn : primaryBtn} onClick={() => void recheck()} disabled={state.phase === "running" || pending}>
          {state.phase === "running" ? "Reading your site…" : scan ? "Recheck my website" : "Read my website"}
        </button>
        <span className="text-[12.5px] text-muted">{scan ? `Last read ${new Date(scan.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · ${website}` : website}</span>
      </div>
      {state.phase === "running" && <ScanProgressView progress={state.progress} />}
      {state.phase === "error" && <ScanError message={state.message} />}
      {result && !ok && <ScanError message={`The last reading didn't work: ${result.error ?? "MAIRO couldn't read the site."}`} />}
      {gone.length > 0 && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.05] p-4">
          <p className="text-[14px] font-medium text-emerald-200">Fixed, confirmed by a recheck</p>
          <ul className="mt-1.5 space-y-1 text-[13px] text-white/80">
            {gone.map((g) => <li key={g.key}>✓ {g.key.split(":")[0].replace(/-/g, " ")} on {g.key.split(":").slice(1).join(":")} — no longer seen on {new Date(g.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</li>)}
          </ul>
        </div>
      )}
      {ok && (
        <>
          <section aria-labelledby="top3">
            <h2 id="top3" className="text-[18px] font-semibold text-white">{top.length ? "The three changes that matter most" : "Nothing urgent found"}</h2>
            <p className="mt-1 text-[13px] text-muted">Each one is a hypothesis to test, with what MAIRO saw. MAIRO can&rsquo;t edit your website — these are changes for you or whoever runs your site.</p>
            <div className="mt-3 space-y-3">{top.map(card)}</div>
          </section>
          <section aria-labelledby="rest">
            <h2 id="rest" className="text-[18px] font-semibold text-white">Everything else MAIRO checked</h2>
            <div className="mt-3 space-y-3">
              {rest.map((f) => (f.status === "ok" ? (
                <p key={f.key} className="rounded-xl border border-white/10 px-4 py-3 text-[13.5px] text-white/80"><span className="mr-2 text-emerald-300">✓</span>{f.title}{f.evidence ? <span className="text-muted"> — {f.evidence}</span> : null}</p>
              ) : card(f)))}
            </div>
          </section>
          <section aria-labelledby="facts">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 id="facts" className="text-[18px] font-semibold text-white">What the website shows about your business</h2>
              <Link href="/dashboard/settings/business-brain" className="text-[13px] text-violet-bright underline underline-offset-4">Confirm or correct in Business Brain</Link>
            </div>
            <p className="mt-1 text-[13px] text-muted">Found on the pages, MAIRO&rsquo;s guess, or not found — nothing filled in that the site doesn&rsquo;t show. Your corrections always win.</p>
            <div className="mt-3"><FactsList result={result} /></div>
          </section>
          <Coverage result={result} />
        </>
      )}
    </div>
  );
}
