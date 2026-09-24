import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  href?: string;
  tone?: "default" | "attention";
}) {
  const body = (
    <div
      className={cn(
        "glass flex h-full flex-col gap-3 rounded-2xl p-4 transition-colors sm:p-5",
        href && "hover:border-line-strong",
        tone === "attention" && "border-warning/30",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</span>
        <Icon className={cn("size-4", tone === "attention" ? "text-warning" : "text-violet-glow")} aria-hidden />
      </div>
      <span className="text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">{value}</span>
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-2xl">
      {body}
    </Link>
  ) : (
    body
  );
}
