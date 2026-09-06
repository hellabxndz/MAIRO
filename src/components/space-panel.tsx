import type { ReactNode } from "react";

// An interface window, floating in space.
//
// The restraint here is deliberate: one hairline border, one very soft shadow,
// a barely-there translucent fill. No glow, no gradient border, no heavy glass.
// The starfield showing faintly through the panel is what sells it as floating
// rather than pasted on, and any more treatment on the panel itself buries that.

export function SpacePanel({
  label,
  children,
  className = "",
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.09] bg-white/[0.025] backdrop-blur-[2px] ${className}`}
      style={{ boxShadow: "0 40px 120px -40px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.02) inset" }}
    >
      {label && (
        <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-5 py-3.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
          <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">{label}</span>
        </div>
      )}
      <div className="p-5 sm:p-7">{children}</div>
    </div>
  );
}
