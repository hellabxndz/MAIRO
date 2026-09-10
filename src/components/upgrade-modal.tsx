"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { PlatformIcon } from "@/components/platform-icons";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui";

// What a Starter customer sees when they click TikTok.
//
// The requirement this exists to satisfy is a small one with a big effect:
// don't block them with an error. Someone selecting a feature their plan
// doesn't include has just told you what they want to buy, and answering that
// with a red validation message is the worst possible reading of the moment.
//
// So this is a sell, not a refusal, and it keeps the door open both ways — the
// secondary action carries on with what they can already do rather than
// leaving them stuck in a dialog with one exit.

export type UpgradeCopy = {
  title: string;
  subtitle: string;
  benefits: string[];
  currentPlanName: string;
  currentPlanPrice: number;
  upgradePlanName: string;
  upgradePlanPrice: number;
  /** Wording for the "no thanks" path — what they keep if they decline. */
  declineLabel: string;
};

export function UpgradeModal({
  open,
  copy,
  onDecline,
  onClose,
}: {
  open: boolean;
  copy: UpgradeCopy;
  onDecline: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape closes, and focus moves into the dialog when it opens. Both are the
  // sort of thing a hand-rolled modal skips and then feels broken without.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    // The page behind must not scroll while this is up.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-title"
    >
      {/* The galaxy is still back there; this dims it rather than covering it,
          so the dialog reads as part of the same room. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
      />

      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/95 shadow-2xl outline-none"
      >
        {/* A thin aurora along the top edge, the same device the marketing
            page uses for its section breaks. */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-sky-400/60 to-transparent" />

        <div className="p-7 sm:p-9">
          <div className="mb-6 flex items-center gap-2 text-neutral-400">
            <PlatformIcon platform="META" className="h-5 w-5" />
            <span className="text-white/30">+</span>
            <PlatformIcon platform="TIKTOK" className="h-5 w-5" />
          </div>

          <h2 id="upgrade-title" className="text-2xl font-light tracking-tight text-white">
            {copy.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-400">{copy.subtitle}</p>

          <div className="mt-7 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                Current plan
              </p>
              <p className="mt-1.5 text-sm text-neutral-300">
                {copy.currentPlanName}
                <span className="text-neutral-500"> — ${copy.currentPlanPrice}/month</span>
              </p>
            </div>
            <div className="rounded-2xl border border-sky-400/25 bg-sky-400/[0.06] p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-sky-300/80">Upgrade</p>
              <p className="mt-1.5 text-sm text-white">
                {copy.upgradePlanName}
                <span className="text-neutral-400"> — ${copy.upgradePlanPrice}/month</span>
              </p>
            </div>
          </div>

          <ul className="mt-6 space-y-2.5">
            {copy.benefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2.5 text-sm text-neutral-300">
                <svg
                  viewBox="0 0 16 16"
                  className="mt-0.5 h-4 w-4 flex-none text-sky-400"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="m3.5 8.5 3 3 6-7"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {benefit}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row-reverse">
            <Link
              href="/dashboard/settings#billing"
              className={`${primaryButtonClass} flex-1 justify-center text-center`}
            >
              Upgrade to {copy.upgradePlanName}
            </Link>
            <button
              type="button"
              onClick={onDecline}
              className={`${secondaryButtonClass} flex-1 justify-center text-center`}
            >
              {copy.declineLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
