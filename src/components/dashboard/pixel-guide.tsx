import Link from "next/link";
import { Card } from "@/components/ui";
import { SimplePixel } from "@/app/dashboard/tracking/simple-pixel";
import { loadSimplePixel } from "@/lib/tracking/simple-view";
import { loadPixelSetup } from "@/lib/tracking/pixel-setup";

// On the dashboard home until tracking works: the same three steps as the
// Tracking page (pixel, one line on the website, a check), so a business can
// set it up without going looking. Gone once Meta has confirmed the event the
// campaigns are judged on; nothing while Meta isn't connected — connecting
// comes first and has its own step.

export async function PixelGuide({ organizationId, className = "" }: { organizationId: string; className?: string }) {
  const [{ view, verified, stepsDone }, setup] = await Promise.all([
    loadSimplePixel(organizationId).catch(() => ({ view: null, verified: true, stepsDone: 0 })),
    loadPixelSetup(organizationId).catch(() => null),
  ]);
  if (!view || verified || !view.connected) return null;
  // The owner's answer stands: no nagging after "I don't want to connect a Pixel".
  if (setup?.decision === "declined") return null;
  const shop = setup?.need === "required_for_purchases";
  return (
    <Card className={className}>
      <details open={shop} className="group">
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">
              {shop ? "Set up tracking" : "Optional tracking"} · {stepsDone} of 3 done
            </p>
            <h2 className="mt-1 text-base font-medium text-white">{shop ? "Let MAIRO measure your website sales" : "Count enquiries made on your website"}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-400">
              {shop
                ? "Your Meta Pixel and one line on your website — about five minutes. Without it, Meta can't count purchases from your ads or learn who buys, and campaigns aimed at website purchases can't launch."
                : "Only if people enquire or book on your website. Calls, Meta's lead forms and the leads you mark are counted without it."}
            </p>
          </div>
          <span className="text-sm text-violet-bright group-open:hidden">Show me how</span>
          <span className="hidden text-sm text-neutral-400 group-open:inline">Hide</span>
        </summary>
        <div className="mt-6 border-t border-white/10 pt-6">
          <SimplePixel view={view} heading={false} advancedHref="/dashboard/tracking#advanced" />
          <p className="mt-6 text-xs text-neutral-500">
            Choose what to measure and check each event in the{" "}
            <Link href="/dashboard/pixel" className="text-neutral-300 underline underline-offset-4 hover:text-white">
              guided tracking setup
            </Link>
            .
          </p>
        </div>
      </details>
    </Card>
  );
}
