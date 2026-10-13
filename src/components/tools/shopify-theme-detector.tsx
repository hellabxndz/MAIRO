"use client";

import { useWebsiteScan } from "./use-website-scan";
import { Coverage, ScanError, ScanForm, ScanProgressView } from "./website-report";
import { NextStep, ResultPanel, Stat } from "./ui";

export function ShopifyThemeDetectorTool() {
  const { state, run } = useWebsiteScan();
  const r = state.phase === "done" ? state.result : null;
  const ok = r && (r.status === "OK" || r.status === "PARTIAL");
  const th = r?.shopifyTheme;
  return (
    <div className="space-y-5">
      <ScanForm state={state} label="Detect theme" placeholder="store.com" onScan={(url) => void run({ url })} />
      {state.phase === "running" && <ScanProgressView progress={state.progress} />}
      {state.phase === "error" && <ScanError message={state.message} />}
      {r && !ok && <ScanError message={r.error ?? "MAIRO couldn't read that page."} />}
      {ok && r && (
        <>
          <ResultPanel title={th ? "Theme found on the page" : r.platform?.name === "Shopify" ? "Shopify store — theme not visible" : "Not detected as a Shopify store"}>
            {th ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Stat strong label="Theme name on the page" value={th.name ?? "Not shown"} sub="Stores can rename their theme." />
                  <Stat label="Original theme" value={th.schemaName ?? "Not shown"} />
                  <Stat label="Shopify Theme Store ID" value={th.themeStoreId ? String(th.themeStoreId) : "None"} sub={th.themeStoreId ? "From Shopify's Theme Store." : "Custom or not from the Theme Store."} />
                </div>
                <p className="mt-3 break-all text-[12.5px] text-white/55">Evidence: {th.evidence[0]?.where}</p>
              </>
            ) : (
              <p className="text-[13.5px] text-white/80">{r.platform?.name === "Shopify" ? "This is a Shopify store, but the page doesn't declare its theme publicly. Unknown — not guessed." : r.platform ? `This looks like ${r.platform.name}, not Shopify.` : "MAIRO couldn't tell which platform runs this site."}</p>
            )}
          </ResultPanel>
          <Coverage result={r} cached={state.phase === "done" && state.cached} />
          <NextStep title="What else runs on this store?" body="The app detector lists the apps and tags the public pages show, with the evidence for each." action="Detect apps" href="/tools/shopify-app-detector" />
        </>
      )}
    </div>
  );
}
