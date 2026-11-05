import type { ReactNode } from "react";

// The white card a sign-in or sign-up form sits on. The page decides how wide
// it is and what sits next to it; the (auth) layout only draws the backdrop
// and the wordmark.
export function AuthCard({ children, className = "mx-auto max-w-sm" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`w-full rounded-[24px] border border-[color:var(--v3-line)] bg-[color:var(--v3-ink-2)] p-6 sm:p-8 ${className}`}>
      {children}
    </div>
  );
}
