import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { formatPlanPrice, type Plan } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

/** One plan, with its price and highlights; the caller supplies the action. */
export function PlanCard({
  plan,
  action,
  current,
  selected,
  note,
  compact,
}: {
  plan: Plan;
  action?: ReactNode;
  current?: boolean;
  selected?: boolean;
  note?: ReactNode;
  compact?: boolean;
}) {
  const free = plan.key === "free";
  const featured = plan.key === "growth";
  return (
    <div
      data-testid={`plan-card-${plan.key}`}
      className={cn(
        "relative flex flex-col rounded-2xl p-5",
        selected ? "glass glow-ring" : free ? "border border-success/40 bg-success/[0.04]" : featured ? "border border-violet/40 bg-violet/[0.05]" : "border border-line bg-white/[0.02]",
      )}
    >
      <div className="absolute -top-3 left-5 flex gap-2">
        {current && <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-ink-950">Current plan</span>}
        {!current && free && <span className="rounded-full bg-success px-2.5 py-0.5 text-xs font-medium text-ink-950">Free Forever</span>}
        {!current && featured && <span className="rounded-full bg-gradient-to-r from-violet to-electric px-2.5 py-0.5 text-xs font-medium">Most Popular</span>}
      </div>
      <h3 className="text-lg font-semibold">{plan.name}</h3>
      <p className="mt-2 text-2xl font-semibold tracking-tight">
        {plan.priceIsStartingAt && <span className="block text-xs font-normal text-fg-subtle">Starting at</span>}
        {formatPlanPrice(plan).replace("From ", "")}
        <span className="text-sm font-normal text-fg-muted">/month</span>
      </p>
      <ul className={cn("mt-3 flex-1 space-y-1.5 text-sm", compact && "text-xs")}>
        {(compact ? plan.highlights.slice(0, 4) : plan.highlights).map((h) => (
          <li key={h} className="flex gap-2">
            <Check className={cn("mt-0.5 size-3.5 shrink-0", free ? "text-success" : "text-violet-glow")} aria-hidden /> {h}
          </li>
        ))}
      </ul>
      {note}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
