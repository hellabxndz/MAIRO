import Link from "next/link";
import { Card } from "@/components/ui";
import { SimplePixel } from "@/app/dashboard/tracking/simple-pixel";
import { loadSimplePixel } from "@/lib/tracking/simple-view";

// On the dashboard home until tracking works: the same three steps as the
// Tracking page (pixel, one line on the website, a check), so a business can
// set it up without going looking. Gone once Meta has confirmed the event the
// campaigns are judged on; nothing while Meta isn't connected — connecting
// comes first and has its own step.

export async function PixelGuide({ organizationId, className = "" }: { organizationId: string; className?: string }) {
  const { view, verified, stepsDone } = await loadSimplePixel(organizationId).catch(() => ({ view: null, verified: true, stepsDone: 0 }));
  if (!view || verified || !view.connected) return null;
  return (
    <Card className={className}>
      <details open className="group">
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Set up tracking · {stepsDone} of 3 done</p>
            <h2 className="mt-1 text-base font-medium text-white">Let MAIRO see who becomes a customer</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-400">
              Your Meta pixel and one line on your website — about five minutes. Without it, Meta can only count clicks, so your
              ads can&rsquo;t learn who actually enquires or buys, and your results here stay estimates.
            </p>
          </div>
          <span className="text-sm text-violet-bright group-open:hidden">Show me how</span>
          <span className="hidden text-sm text-neutral-400 group-open:inline">Hide</span>
        </summary>
        <div className="mt-6 border-t border-white/10 pt-6">
          <SimplePixel view={view} heading={false} advancedHref="/dashboard/tracking#advanced" />
          <p className="mt-6 text-xs text-neutral-500">
            Everything else about tracking — your shop&rsquo;s sales, Google Tag Manager, which pixel to use — is on the{" "}
            <Link href="/dashboard/tracking" className="text-neutral-300 underline underline-offset-4 hover:text-white">
              Tracking page
            </Link>
            .
          </p>
        </div>
      </details>
    </Card>
  );
}
