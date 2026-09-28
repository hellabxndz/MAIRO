"use client";

import { useActionState, useState } from "react";
import { createCampaignAction } from "@/lib/actions/campaign-actions";
import { inputClass, primaryButtonClass } from "@/components/ui";
import { StartTimePicker } from "@/components/start-time-picker";
import type { AdGoal, AdPlatform } from "@/generated/prisma/enums";
import { AudienceFields } from "./audience-fields";

// Creating a campaign: a name, a goal, a budget and where the click goes.
//
// MAIRO runs Meta only, so there is no "where" question — the campaign runs on
// Facebook and Instagram and the whole budget goes there.

const OBJECTIVES: { value: AdGoal; label: string }[] = [
  { value: "LEADS", label: "Leads" },
  { value: "SALES", label: "Sales" },
  { value: "AWARENESS", label: "Awareness" },
  { value: "TRAFFIC", label: "Traffic" },
  { value: "APP_PROMOTION", label: "App promotion" },
];

export type PlanContext = {
  currentPlanName: string;
  currentPlanPrice: number;
  upgradePlanName: string;
  upgradePlanPrice: number;
  /** Which networks actually have a connected account right now. */
  connected: AdPlatform[];
  /** What this business said at signup, pre-filled so they answer once. */
  destination: {
    type: "WEBSITE" | "PHONE_CALL" | "LEAD_FORM" | "DIRECT_MESSAGE";
    website: string | null;
    phone: string | null;
    /** Which inbox, for a message ad. Also answered at signup. */
    channel: "MESSENGER" | "INSTAGRAM" | "WHATSAPP";
    /** The MAIRO-hosted form, if they already chose one before. */
    formUrl: string | null;
    /** What MAIRO would ask, shown before anything is created. */
    formQuestions: string[];
  };
};

export function NewCampaignForm({ plan }: { plan: PlanContext }) {
  const [state, formAction, pending] = useActionState(createCampaignAction, undefined);

  const [objective, setObjective] = useState<AdGoal>("SALES");
  const [budget, setBudget] = useState<number>(50);
  const [destinationType, setDestinationType] = useState<
    "WEBSITE" | "PHONE_CALL" | "LEAD_FORM" | "DIRECT_MESSAGE"
  >(
    plan.destination.type
  );
  const [destinationValue, setDestinationValue] = useState<string>(
    plan.destination.type === "PHONE_CALL"
      ? (plan.destination.phone ?? "")
      : (plan.destination.website ?? "")
  );
  // Only asked when they pick a form, and only when they do not already have
  // one — once a form exists, the campaign uses it and this question is noise.
  const [formAuthor, setFormAuthor] = useState<"MAIRO" | "OWN">("MAIRO");
  // Which inbox a message ad opens. Messenger needs nothing; the other two
  // depend on the Page having Instagram or WhatsApp attached to it.
  const [channel, setChannel] = useState<"MESSENGER" | "INSTAGRAM" | "WHATSAPP">(
    plan.destination.channel,
  );
  // Where the form opens. The hosted page works today; Meta's own converts
  // better and is gated behind App Review.
  const [delivery, setDelivery] = useState<"HOSTED_PAGE" | "META_NATIVE">("HOSTED_PAGE");

  const platforms: AdPlatform[] = ["META"];

  const notConnected = platforms.filter((p) => !plan.connected.includes(p));

  return (
    <>
      <form action={formAction} className="space-y-7">
        {/* The whole budget goes to Meta. The server re-derives the money
            rather than trusting any amount the client computed. */}
        <input type="hidden" name="platforms" value="META" />
        <input type="hidden" name="percents" value={100} />

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-400">Campaign name</label>
            <input name="name" required className={inputClass} placeholder="Fall clothing" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-400">What do you want?</label>
            <select
              name="objective"
              required
              className={inputClass}
              value={objective}
              onChange={(e) => setObjective(e.target.value as AdGoal)}
            >
              {OBJECTIVES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-400">Total daily budget</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
                $
              </span>
              <input
                name="dailyBudget"
                type="number"
                min={1}
                step={1}
                required
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className={`${inputClass} pl-7`}
              />
            </div>
          </div>
        </div>

        {/* ---- who sees it ---- */}
        {/* The question Ads Manager puts behind a map and a box of interests,
            and the one MAIRO was not asking at all — so every ad ran across the
            whole country at every age, which is most of a small budget spent on
            people who were never going to buy. */}
        <fieldset className="space-y-3 border-t border-white/10 pt-6">
          <legend className="text-sm text-white">Who should see it?</legend>
          <AudienceFields />
        </fieldset>

        {/* ---- what the click does ---- */}
        {/* Asked, because it cannot be guessed. MAIRO used to take the
            business's website without mentioning it, which sent a plumber's
            customers to a homepage when they wanted to ring him, and gave a
            business with no website no ad at all. */}
        <fieldset className="space-y-3">
          <legend className="text-sm text-white">
            What should happen when someone taps the ad?
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                {
                  key: "WEBSITE" as const,
                  label: "Go to my website",
                  sub: "The exact page you want them to land on",
                },
                {
                  key: "PHONE_CALL" as const,
                  label: "Call me",
                  sub: "A tap-to-call button, straight to your phone",
                },
                {
                  key: "LEAD_FORM" as const,
                  label: "Fill in a form",
                  sub: "MAIRO writes one for your trade. No website needed.",
                },
                {
                  key: "DIRECT_MESSAGE" as const,
                  label: "Message me",
                  sub: "Opens a chat with your Facebook Page",
                },
              ]
            ).map((d) => {
              const selected = destinationType === d.key;
              return (
                <button
                  key={d.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setDestinationType(d.key);
                    setDestinationValue(
                      d.key === "PHONE_CALL"
                        ? (plan.destination.phone ?? "")
                        : d.key === "LEAD_FORM"
                          ? ""
                          : (plan.destination.website ?? "")
                    );
                  }}
                  className={`rounded-2xl border p-4 text-left transition ${
                    selected
                      ? "border-white/30 bg-white/[0.06]"
                      : "border-white/10 hover:border-white/20"
                  }`}
                >
                  <p className="text-sm text-white">{d.label}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">{d.sub}</p>
                </button>
              );
            })}
          </div>

          <input type="hidden" name="destinationType" value={destinationType} />
          {destinationType === "LEAD_FORM" ? (
            <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <input type="hidden" name="leadFormDelivery" value={delivery} />
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    {
                      key: "HOSTED_PAGE" as const,
                      label: "A page MAIRO hosts",
                      sub: "Works today. One tap and a page load.",
                    },
                    {
                      key: "META_NATIVE" as const,
                      label: "Meta's own instant form",
                      sub: "Opens in the app, details already filled in",
                    },
                  ]
                ).map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    aria-pressed={delivery === d.key}
                    onClick={() => setDelivery(d.key)}
                    className={`rounded-lg border p-3 text-left transition ${
                      delivery === d.key
                        ? "border-white/30 bg-white/[0.06]"
                        : "border-white/10 hover:border-white/20"
                    }`}
                  >
                    <p className="text-sm text-white">{d.label}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">{d.sub}</p>
                  </button>
                ))}
              </div>
              {delivery === "META_NATIVE" && (
                <p className="text-xs leading-relaxed text-amber-200/70">
                  Meta fills in their name, email and phone, so far more people finish it — but
                  it needs two permissions still in App Review. MAIRO tries when you create this
                  campaign and tells you straight away if Meta says no; the hosted page keeps
                  working either way.
                </p>
              )}

              {plan.destination.formUrl ? (
                <>
                  <p className="text-sm text-neutral-300">
                    People who tap the ad land on your form. Answers appear under Enquiries.
                  </p>
                  {plan.destination.formQuestions.length > 0 && (
                    <ol className="space-y-1">
                      {plan.destination.formQuestions.map((q, i) => (
                        <li key={q} className="text-sm text-neutral-500">
                          {i + 1}. {q}
                        </li>
                      ))}
                    </ol>
                  )}
                  <p className="break-all font-mono text-xs text-neutral-600">
                    {plan.destination.formUrl}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-neutral-300">
                    You don&apos;t have a form yet. Who should write it?
                  </p>
                  <input type="hidden" name="formAuthor" value={formAuthor} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(
                      [
                        {
                          key: "MAIRO" as const,
                          label: "MAIRO writes it",
                          sub: "Questions for your trade, ready when this campaign is",
                        },
                        {
                          key: "OWN" as const,
                          label: "I'll write my own",
                          sub: "Pick your own questions on the Enquiries page",
                        },
                      ]
                    ).map((a) => (
                      <button
                        key={a.key}
                        type="button"
                        aria-pressed={formAuthor === a.key}
                        onClick={() => setFormAuthor(a.key)}
                        className={`rounded-lg border p-3 text-left transition ${
                          formAuthor === a.key
                            ? "border-white/30 bg-white/[0.06]"
                            : "border-white/10 hover:border-white/20"
                        }`}
                      >
                        <p className="text-sm text-white">{a.label}</p>
                        <p className="mt-0.5 text-xs text-neutral-500">{a.sub}</p>
                      </button>
                    ))}
                  </div>

                  {formAuthor === "MAIRO" && plan.destination.formQuestions.length > 0 && (
                    <ol className="space-y-1 pt-1">
                      {plan.destination.formQuestions.map((q, i) => (
                        <li key={q} className="text-sm text-neutral-500">
                          {i + 1}. {q}
                        </li>
                      ))}
                    </ol>
                  )}
                  {formAuthor === "OWN" && (
                    <p className="text-xs leading-relaxed text-neutral-500">
                      MAIRO starts you off with a name and a phone number — every form needs a way
                      to reply — and you change the rest under Enquiries. The ad points at it
                      either way, so you can edit it after this campaign is running.
                    </p>
                  )}
                </>
              )}
            </div>
          ) : destinationType === "DIRECT_MESSAGE" ? (
            <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-sm text-neutral-300">Which inbox should it open?</p>
              <input type="hidden" name="messageChannel" value={channel} />
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    {
                      key: "MESSENGER" as const,
                      label: "Messenger",
                      sub: "Nothing to set up",
                    },
                    {
                      key: "INSTAGRAM" as const,
                      label: "Instagram",
                      sub: "Needs Instagram linked to your Page",
                    },
                    {
                      key: "WHATSAPP" as const,
                      label: "WhatsApp",
                      sub: "Needs a number connected to your Page",
                    },
                  ]
                ).map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={channel === c.key}
                    onClick={() => setChannel(c.key)}
                    className={`rounded-lg border p-3 text-left transition ${
                      channel === c.key
                        ? "border-white/30 bg-white/[0.06]"
                        : "border-white/10 hover:border-white/20"
                    }`}
                  >
                    <p className="text-sm text-white">{c.label}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">{c.sub}</p>
                  </button>
                ))}
              </div>
              <p className="text-xs leading-relaxed text-neutral-600">
                {channel === "MESSENGER"
                  ? "Opens a chat with the Facebook Page MAIRO already posts your ads as. Replies land in your Page inbox, not in MAIRO."
                  : channel === "INSTAGRAM"
                    ? "MAIRO checks your Page has an Instagram account before it builds this, and tells you if it doesn't. Replies land in your Instagram inbox."
                    : "Your Page needs a WhatsApp number connected to it in Meta Business settings. MAIRO can't check that in advance — if it's missing, Meta refuses the ad and the reason appears on the campaign."}
              </p>
            </div>
          ) : (
          <div className="space-y-1.5">
            <label htmlFor="destinationValue" className="text-xs font-medium text-neutral-400">
              {destinationType === "PHONE_CALL"
                ? "The number it should ring"
                : "The page it should open"}
            </label>
            <input
              id="destinationValue"
              name="destinationValue"
              inputMode={destinationType === "PHONE_CALL" ? "tel" : "url"}
              value={destinationValue}
              onChange={(e) => setDestinationValue(e.target.value)}
              placeholder={
                destinationType === "PHONE_CALL"
                  ? "(555) 123-4567"
                  : "yourshop.com/the-thing-you-are-advertising"
              }
              className={inputClass}
            />
            <p className="text-xs text-neutral-600">
              {destinationType === "PHONE_CALL"
                ? "Meta shows a call button. Nobody sees your number until they tap it."
                : "Send them to the thing in the ad, not your homepage — people don't go looking."}
            </p>
          </div>
          )}
        </fieldset>

        {/* ---- when ---- */}
        <StartTimePicker
          reviewer="Meta"
        />

        {notConnected.length > 0 && (
          <p className="text-xs text-amber-300/80">
            Meta isn&rsquo;t connected yet — the campaign will be saved as a draft and go
            live once you connect it in Settings.
          </p>
        )}

        <div className="flex items-center gap-4">
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? "Creating…" : "Create campaign"}
          </button>
          {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
        </div>

        {state?.partial && state.partial.length > 0 && !state.error && (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-4">
            <p className="text-sm text-amber-200">
              Your campaign was created, but not all of it reached Meta.
            </p>
            <ul className="mt-2 space-y-1">
              {state.partial.map((f) => (
                <li key={f.platform} className="text-xs text-amber-200/80">
                  <span className="font-medium">{f.platform}:</span> {f.error}
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </>
  );
}
