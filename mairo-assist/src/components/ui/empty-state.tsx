import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line px-6 py-12 text-center", className)}>
      <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet/20 to-electric/20 ring-1 ring-violet/25">
        <Icon className="size-5 text-violet-glow" aria-hidden />
      </div>
      <div className="max-w-md space-y-1">
        <p className="font-medium text-fg">{title}</p>
        <div className="text-sm text-fg-muted">{description}</div>
      </div>
      {action}
    </div>
  );
}
