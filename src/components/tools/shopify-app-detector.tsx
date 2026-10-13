"use client";

import { useWebsiteScan } from "./use-website-scan";
import { Coverage, ScanError, ScanForm, ScanProgressView } from "./website-report";
import { NextStep, ResultPanel } from "./ui";

export function ShopifyAppDetectorTool() {
  const { state, run } = useWebsiteScan();
  const r = state.phase === "done" ? state.result : null;
  const ok = r && (r.status === "OK" || r.status === "PARTIAL");
  const shopify = r?.platform?.name === "Shopify";
  const groups = r ? [...new Set(r.apps.map((a) => a.category))] : [];
  return (
    <div className="space-y-5">
      <ScanForm state={state} label="Detect apps" placeholder="store.com" onScan={(url) => void run({ url })} />
      {state.phase === "running" && <ScanProgressView progress={state.progress} />}
      {state.phase === "error" && <ScanError message={state.message} />}
      {r && !ok && <ScanError message={r.error ?? "MAIRO couldn't read that page."} />}
      {ok && r && (
        <>
          <ResultPanel title={shopify ? "Apps and scripts seen on the public pages" : "Not detected as a Shopify store"}>
            {!shopify && <p className="mb-3 text-[13.5px] text-white/80">{r.platform ? `This looks like ${r.platform.name} (${r.platform.confidence === "certain" ? "its files are on the page" : "it's mentioned on the page"}).` : "MAIRO couldn't tell which platform runs this site."} Scripts it recognised are still listed below.</p>}
            {r.apps.length ? (
              <div className="space-y-4">
                {groups.map((g) => (
                  <div key={g}>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-violet-bright">{g}</p>
                    <ul className="mt-1.5 space-y-1.5">
                      {r.apps.filter((a) => a.category === g).map((a) => (
                        <li key={a.name} className="rounded-lg bg-paper/50 px-3 py-2 text-[13px]"><span className="font-medium text-white">{a.name}</span> <span className="break-all text-white/55">— {a.evidence.where}</span></li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13.5px] text-white/75">No apps MAIRO recognises were detected on the pages read.</p>
            )}
            {shopify && r.appExtensions > 0 && <p className="mt-3 text-[13px] text-white/75">Plus {r.appExtensions} Shopify app extension{r.appExtensions === 1 ? "" : "s"} loading — Shopify doesn&rsquo;t show which app each belongs to.</p>}
            <ul className="mt-4 list-disc space-y-1 pl-5 text-[12.5px] text-white/55">
              <li>&ldquo;Not detected&rdquo; doesn&rsquo;t mean &ldquo;not installed&rdquo;: apps that work in the admin, at checkout or only after a click don&rsquo;t show on public pages.</li>
              <li>A tracking script on a store doesn&rsquo;t mean the store is advertising there now, or that its events work.</li>
            </ul>
          </ResultPanel>
          <Coverage result={r} cached={state.phase === "done" && state.cached} />
          <NextStep title="Check the store before you advertise it" body="The landing page audit looks at what an ad's visitor would find — and your free MAIRO plan builds on it." action="Audit this page" href="/tools/landing-page-audit" />
        </>
      )}
    </div>
  );
}
