import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  info: { icon: Info, cls: "border-electric/25 bg-electric/8 text-fg" , iconCls: "text-electric" },
  success: { icon: CheckCircle2, cls: "border-success/25 bg-success/8 text-fg", iconCls: "text-success" },
  warning: { icon: AlertTriangle, cls: "border-warning/25 bg-warning/8 text-fg", iconCls: "text-warning" },
  danger: { icon: XCircle, cls: "border-danger/25 bg-danger/8 text-fg", iconCls: "text-danger" },
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof tones;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const t = tones[tone];
  const Icon = t.icon;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border p-3.5 text-sm", t.cls, className)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", t.iconCls)} aria-hidden />
      <div className="space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-fg-muted">{children}</div>}
      </div>
    </div>
  );
}
