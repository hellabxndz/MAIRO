import Link from "next/link";
import type { CreditBalance } from "@/lib/creative-studio/credits";

// What this session's generation will cost, next to what is actually left.
//
// Shown before the click, not just after — "estimated credit cost before
// generation" was explicit in the brief, and the reason is the same reason a
// price is shown before checkout rather than on the receipt: someone should
// never be surprised by what an action just cost them.

export function CreditMeter({
  balance,
  estimatedCost,
}: {
  balance: CreditBalance;
  /** What the currently-configured action would cost, if run right now. */
  estimatedCost?: number;
}) {
  const pct = balance.allowance > 0 ? Math.min(100, (balance.used / balance.allowance) * 100) : 0;
  const wouldExceed = estimatedCost !== undefined && estimatedCost > balance.remaining;

  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={{ borderColor: "var(--mairo-line)", background: "rgba(255,255,255,0.02)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-neutral-400">
          <span className="text-white">{balance.remaining}</span> of {balance.allowance} AI credits left this
          month
        </p>
        {estimatedCost !== undefined && (
          <p className={`text-[12px] ${wouldExceed ? "text-amber-300" : "text-neutral-500"}`}>
            This will cost {estimatedCost}
          </p>
        )}
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{
            width: `${pct}%`,
            backgroundImage: wouldExceed ? undefined : "var(--mairo-ramp)",
            background: wouldExceed ? "rgb(251,191,36)" : undefined,
          }}
        />
      </div>
      {wouldExceed && (
        <p className="mt-2 text-[11.5px] text-amber-300">
          Not enough left for this.{" "}
          <Link href="/dashboard/settings#billing" className="underline underline-offset-2 hover:text-white">
            Move up a plan
          </Link>{" "}
          for more, or wait for the reset on the 1st.
        </p>
      )}
    </div>
  );
}
