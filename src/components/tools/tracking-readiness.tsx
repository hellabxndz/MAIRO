"use client";

import { recommendedEvents } from "@/lib/tracking/events";
import { useWebsiteScan } from "./use-website-scan";
import { Coverage, ScanError, ScanForm, ScanProgressView } from "./website-report";
import { NextStep, ResultPanel } from "./ui";

const Row = ({ label, value, note, state }: { label: string; value: string; note?: string; state: "found" | "not detected" | "unknown" }) => (
  <li className="rounded-xl border border-white/10 bg-paper/50 px-4 py-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[14px] font-medium text-white">{label}</p>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${state === "found" ? "bg-emerald-400/15 text-emerald-300" : state === "unknown" ? "bg-white/[0.07] text-white/65" : "bg-amber-400/15 text-amber-200"}`}>{state === "found" ? "Detected" : state === "unknown" ? "Can't tell from outside" : "Not detected"}</span>
    </div>
    <p className="mt-1 break-all text-[13px] text-white/75">{value}</p>
    {note && <p className="mt-1 text-[12px] text-white/50">{note}</p>}
  </li>
);

export function TrackingReadinessTool() {
  const { state, run } = useWebsiteScan();
  const r = state.phase === "done" ? state.result : null;
  const ok = r && (r.status === "OK" || r.status === "PARTIAL");
  const t = r?.tracking;
  const events = r ? recommendedEvents(r.kind, { booking: r.destinations.booking.length > 0, phone: r.destinations.phoneLinks.length > 0 }) : [];
  return (
    <div className="space-y-5">
      <ScanForm state={state} label="Check tracking" onScan={(url) => void run({ url })} />
      {state.phase === "running" && <ScanProgressView progress={state.progress} />}
      {state.phase === "error" && <ScanError message={state.message} />}
      {r && !ok && <ScanError message={r.error ?? "MAIRO couldn't read that page."} />}
      {ok && t && (
        <>
          <ResultPanel title="What the public page shows">
            <ul className="space-y-2.5">
              <Row label="Meta pixel" state={t.metaPixelScript ? "found" : t.shopifyWebPixels || t.gtmContainers.length ? "unknown" : "not detected"} value={t.metaPixelIds.length ? `Pixel ID${t.metaPixelIds.length > 1 ? "s" : ""}: ${t.metaPixelIds.join(", ")}` : t.metaPixelScript ? "Meta's pixel library loads" : "No Meta pixel code in the page"} note={t.metaPixelScript ? "Detected code doesn't prove a lead or purchase event reaches Meta." : t.shopifyWebPixels ? "This store uses Shopify web pixels, which run in a sandbox a public check can't see into." : t.gtmContainers.length ? "Tags inside Tag Manager load later and can't be seen from outside." : undefined} />
              <Row label="Google Tag Manager" state={t.gtmContainers.length ? "found" : "not detected"} value={t.gtmContainers.join(", ") || "None"} />
              <Row label="Google Analytics / Google Ads" state={t.ga4Ids.length || t.googleAdsIds.length ? "found" : "not detected"} value={[...t.ga4Ids, ...t.googleAdsIds].join(", ") || "None"} />
              <Row label="Consent banner" state={r.consent.length ? "found" : "not detected"} value={r.consent.map((c) => c.name).join(", ") || "None found"} note={r.consent.length ? "Tracking that waits for consent won't be seen by a visitor-less check — that's expected." : "If you advertise to people in places that require consent (such as the EU and UK), tracking needs a consent choice first."} />
              <Row label="Other ad tags" state={t.tiktok || t.pinterest || t.snapchat || t.microsoftAds ? "found" : "not detected"} value={[t.tiktok && "TikTok", t.pinterest && "Pinterest", t.snapchat && "Snapchat", t.microsoftAds && "Microsoft Ads"].filter(Boolean).join(", ") || "None"} note="A tag on a page doesn't mean the business is advertising there now." />
            </ul>
          </ResultPanel>
          <ResultPanel title={`Events to send for ${r.kind === "shop" ? "an online shop" : r.kind === "service" ? "a service business" : "this site"}`}>
            <ul className="space-y-2.5">
              {events.map((e) => (
                <li key={e.name} className="rounded-xl border border-white/10 bg-paper/50 px-4 py-3 text-[13px] leading-relaxed text-white/80">
                  <p className="text-[14px] font-medium text-white">{e.name}{e.required ? <span className="ml-2 rounded-full bg-white/[0.07] px-2 py-0.5 text-[10.5px] text-white/60">Needed</span> : null}</p>
                  <p className="mt-0.5"><span className="text-white/50">Fire: </span>{e.when}</p>
                  <p><span className="text-white/50">Not: </span>{e.notWhen}</p>
                  <p><span className="text-white/50">Carries: </span>{e.carries}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-white/50">MAIRO can only confirm an event works by checking Meta&rsquo;s own records after a test — not by reading the page.</p>
          </ResultPanel>
          <Coverage result={r} cached={state.phase === "done" && state.cached} />
          <NextStep title="Set it up and verify it" body="With your Meta account connected, MAIRO lists the pixels you already have, helps you install one, and checks Meta's records for each event." action="Continue with this website" handoff={{ kind: "website", tool: "tracking-readiness", url: r.finalUrl ?? r.requestedUrl }} />
        </>
      )}
    </div>
  );
}
