import { cn, formatNumber } from "@/lib/utils";

export function CreditsMeter({ used, limit }: { used: number; limit: number }) {
  const remaining = Math.max(0, limit - used);
  const ratio = limit ? Math.min(1, used / limit) : 0;
  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums" data-testid="credits-remaining">
        {formatNumber(remaining)} <span className="text-base font-normal text-fg-muted">/ {formatNumber(limit)} remaining</span>
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5" role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={remaining} aria-label="AI credits remaining">
        <div
          className={cn("h-full rounded-full", ratio >= 1 ? "bg-danger" : ratio >= 0.8 ? "bg-warning" : "bg-gradient-to-r from-violet to-electric")}
          style={{ width: `${(1 - ratio) * 100}%` }}
        />
      </div>
    </div>
  );
}
