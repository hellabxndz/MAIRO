import type { ReactNode } from "react";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="glass glow-ring rounded-2xl p-6 sm:p-8">
      <div className="mb-6 space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {children}
      {footer && <div className="mt-6 border-t border-line pt-5 text-center text-sm text-fg-muted">{footer}</div>}
    </div>
  );
}

export function ConfigNotice() {
  return (
    <p className="mb-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-fg-muted">
      Accounts aren&apos;t available on this deployment yet — Supabase hasn&apos;t been configured. See the setup guide in
      <code className="mx-1 rounded bg-white/10 px-1">mairo-assist/README.md</code>.
    </p>
  );
}
