"use client";

// Plays the intro on demand, for anyone who skipped it or wants it again.
//
// A custom event rather than a prop or a context: the overlay and this link sit
// in completely different parts of the page, and neither needs to know the
// other exists. Nothing to thread through, nothing to re-render.

export function ReplayIntroLink({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("mairo:play-intro"))}
      className={className}
    >
      Why MAIRO?
    </button>
  );
}
