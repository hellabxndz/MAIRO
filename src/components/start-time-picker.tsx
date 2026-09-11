"use client";

import { useState } from "react";
import { inputClass } from "@/components/ui";

// Choosing when the ads should start.
//
// Two options, not a date field with a blank default. "As soon as it's
// approved" is what most people want and it has to be the obvious, pre-chosen
// answer — a required date picker would make everybody schedule something,
// including the people who just want to get going.
//
// The wording is careful about a thing customers get wrong constantly: Meta
// reviews every ad, that review takes anywhere from minutes to a day, and
// nothing delivers before it passes. So a chosen time is a floor, not a
// promise. Saying "starts Friday 9am" and then having it start Friday
// afternoon because review was slow is the kind of small lie that costs trust,
// so the interface says "no earlier than" instead.
//
// The zone travels with the time. A wall-clock string on its own is not an
// instant, and reading it on the server would put a launch several hours out
// for anybody not sitting in the server's timezone.

export type StartChoice = "now" | "scheduled";

/** Rounded up to the next quarter hour, a couple of hours out. */
function defaultLocal(): string {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The earliest the field will accept: fifteen minutes from now. */
function minLocal(): string {
  const d = new Date(Date.now() + 15 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function StartTimePicker({
  /** Which networks this campaign runs on, so the copy names the right one. */
  reviewer = "Meta",
}: {
  reviewer?: string;
}) {
  const [choice, setChoice] = useState<StartChoice>("now");
  const [local, setLocal] = useState<string>("");
  const [zone, setZone] = useState<string>("");

  // Both of these are filled in when the customer picks "on a date I choose",
  // not on mount. The server cannot know what timezone they are in or what
  // time it is for them, so computing either during the first render would
  // produce a hydration mismatch and then a wrong default. A click is a client
  // event, so by the time this runs the answers are real.
  function chooseScheduled() {
    setChoice("scheduled");
    if (!local) setLocal(defaultLocal());
    if (!zone) {
      try {
        setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
      } catch {
        // A browser that will not say where it is still gets to schedule; the
        // time is simply read as UTC and echoed back that way.
        setZone("UTC");
      }
    }
  }

  const zoneLabel = zone ? zone.split("/").pop()?.replace(/_/g, " ") : null;

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm text-white">When should it start?</legend>

      {/* Only sent when they actually scheduled something. An empty startLocal
          is what the server reads as "start on approval". */}
      {choice === "scheduled" && (
        <>
          <input type="hidden" name="startLocal" value={local} />
          <input type="hidden" name="startTimeZone" value={zone} />
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Option
          selected={choice === "now"}
          onSelect={() => setChoice("now")}
          title={`As soon as ${reviewer} approves it`}
          sub="Usually within a few hours. Nothing spends before then."
        />
        <Option
          selected={choice === "scheduled"}
          onSelect={chooseScheduled}
          title="On a date I choose"
          sub="For a sale, a launch, or a weekend."
        />
      </div>

      {choice === "scheduled" && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <label className="text-xs font-medium text-neutral-400" htmlFor="start-at">
            Start no earlier than
          </label>
          <input
            id="start-at"
            type="datetime-local"
            value={local}
            min={minLocal()}
            onChange={(e) => setLocal(e.target.value)}
            className={`${inputClass} mt-1.5 max-w-xs [color-scheme:dark]`}
          />
          {zoneLabel && (
            <p className="mt-2 text-[11px] text-neutral-500">
              Times are in your own timezone ({zoneLabel}).
            </p>
          )}
          {/* The bit people get wrong. Meta reviews every ad, and a scheduled
              time cannot pull that forward. */}
          <p className="mt-3 max-w-xl text-xs leading-relaxed text-neutral-500">
            {reviewer} reviews every ad before it can run, and that review can take
            anywhere from a few minutes to a day. MAIRO will not start your ads before
            the time you pick — but if the review is still going then, they start as
            soon as it finishes.
          </p>
        </div>
      )}
    </fieldset>
  );
}

function Option({
  selected,
  onSelect,
  title,
  sub,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-2xl border p-4 text-left transition ${
        selected
          ? "border-sky-400/40 bg-sky-400/[0.07]"
          : "border-white/[0.07] bg-white/[0.02] hover:border-white/20"
      }`}
    >
      <p className="text-sm text-white">{title}</p>
      <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>
    </button>
  );
}
