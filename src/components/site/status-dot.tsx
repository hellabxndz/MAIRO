// A status as the v3 "Signal" design draws it: a small dot and a word. The
// status helpers (lib/dashboard/campaigns.ts, lib/meta/account-history-rules.ts)
// still name the state with an emoji; this turns it into the dot — lime for
// live or working, amber for "needs you", red for refused, grey for idle.

const TONE: Record<string, string> = {
  "🟢": "bg-[color:var(--v3-signal)]",
  "🟡": "bg-amber-300",
  "🟠": "bg-amber-400",
  "🔴": "bg-red-400",
  "⚪": "bg-white/40",
  "⏸": "bg-white/40",
};

export function StatusDot({ dot, text, className = "" }: { dot: string; text: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE[dot] ?? "bg-white/40"}`} />
      {text}
    </span>
  );
}
