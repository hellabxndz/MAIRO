import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    tone: {
      neutral: "bg-white/5 text-fg-muted border border-line",
      violet: "bg-violet/15 text-violet-glow border border-violet/25",
      blue: "bg-electric/15 text-electric border border-electric/25",
      success: "bg-success/12 text-success border border-success/25",
      warning: "bg-warning/12 text-warning border border-warning/25",
      danger: "bg-danger/12 text-danger border border-danger/25",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function StatusDot({ tone = "success", pulse = false }: { tone?: "success" | "warning" | "danger" | "neutral"; pulse?: boolean }) {
  const color = { success: "bg-success", warning: "bg-warning", danger: "bg-danger", neutral: "bg-fg-subtle" }[tone];
  return (
    <span className="relative inline-flex size-2">
      {pulse && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", color)} />}
      <span className={cn("relative inline-flex size-2 rounded-full", color)} />
    </span>
  );
}
