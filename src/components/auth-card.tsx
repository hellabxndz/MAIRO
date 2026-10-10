import type { ReactNode } from "react";

// The white card a sign-in or sign-up form sits on. The page decides how wide
// it is and what sits next to it; the (auth) layout only draws the backdrop
// and the wordmark.
export function AuthCard({ children, className = "mx-auto max-w-sm" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`w-full rounded-2xl border border-white/10 bg-paper p-6 shadow-[0_24px_60px_-30px_rgba(18,21,43,0.28)] sm:p-8 ${className}`}>
      {children}
    </div>
  );
}
