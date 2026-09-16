"use client";

import { useState, useTransition } from "react";
import { inputClass } from "@/components/ui";
import { setCampaignDestinationAction } from "@/lib/actions/campaign-actions";
import { CHANNEL_LABELS } from "@/lib/campaigns/destination";
import type { AdDestination, MessageChannel } from "@/generated/prisma/enums";

// Changing where an existing campaign sends people.
//
// The card already said "there's no address on it yet" in plain words, and
// then offered nothing to do about it: the only routes were Settings, which
// changes every campaign, and deleting this one to build it again, which
// throws away a Meta review it has already been through.
//
// Collapsed to a line of text until somebody wants to change it, like the
// schedule control beside it. Most campaigns are pointed somewhere once.

const CHOICES: { key: AdDestination; label: string }[] = [
  { key: "WEBSITE", label: "My website" },
  { key: "PHONE_CALL", label: "Call me" },
  { key: "LEAD_FORM", label: "Fill in a form" },
  { key: "DIRECT_MESSAGE", label: "Message me" },
];

export function DestinationControl({
  campaignId,
  type,
  url,
  phone,
  channel,
  /** True once an ad exists, which is what makes this unchangeable. */
  built,
}: {
  campaignId: string;
  type: AdDestination;
  url: string | null;
  phone: string | null;
  channel: MessageChannel;
  built: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [nextType, setNextType] = useState<AdDestination>(type);
  const [value, setValue] = useState(type === "PHONE_CALL" ? (phone ?? "") : (url ?? ""));
  const [nextChannel, setNextChannel] = useState<MessageChannel>(channel);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const current =
    type === "PHONE_CALL"
      ? phone
      : type === "DIRECT_MESSAGE"
        ? `${CHANNEL_LABELS[channel]} messages`
        : url;

  const needsValue = nextType === "WEBSITE" || nextType === "PHONE_CALL";

  function save() {
    start(async () => {
      setError(null);
      const result = await setCampaignDestinationAction(campaignId, {
        type: nextType,
        value,
        channel: nextChannel,
      });
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  if (!open) {
    return (
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
        <span className="text-neutral-500">Sends people to</span>
        {current ? (
          <span className="text-neutral-300">{current}</span>
        ) : (
          <span className="text-amber-300">nowhere yet</span>
        )}
        {/* Once the ad is built the link lives inside it on Meta, so offering
            a change here would promise something MAIRO cannot do. */}
        {!built && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-neutral-400 underline underline-offset-4 transition hover:text-white"
          >
            {current ? "Change" : "Add it"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex flex-wrap gap-2">
        {CHOICES.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={nextType === c.key}
            onClick={() => {
              setNextType(c.key);
              setError(null);
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs transition ${
              nextType === c.key
                ? "border-white/40 bg-white/[0.06] text-white"
                : "border-white/10 bg-white/5 text-neutral-300 hover:border-white/25"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {needsValue && (
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={nextType === "PHONE_CALL" ? "(555) 123-4567" : "yourshop.com/offer"}
          inputMode={nextType === "PHONE_CALL" ? "tel" : "url"}
          className={`${inputClass} max-w-sm text-sm`}
        />
      )}

      {nextType === "DIRECT_MESSAGE" && (
        <select
          value={nextChannel}
          onChange={(e) => setNextChannel(e.target.value as MessageChannel)}
          className={`${inputClass} max-w-xs text-sm`}
        >
          {(Object.keys(CHANNEL_LABELS) as MessageChannel[]).map((c) => (
            <option key={c} value={c} className="bg-neutral-900">
              {CHANNEL_LABELS[c]}
            </option>
          ))}
        </select>
      )}

      {nextType === "LEAD_FORM" && (
        <p className="max-w-xl text-xs leading-relaxed text-neutral-500">
          MAIRO writes the questions for your trade and hosts the form. Nothing else needed.
        </p>
      )}

      {error && <p className="max-w-xl text-xs leading-relaxed text-amber-300">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || (needsValue && value.trim().length === 0)}
          className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white transition hover:border-white/40 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-xs text-neutral-500 transition hover:text-neutral-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
