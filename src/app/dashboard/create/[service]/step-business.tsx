"use client";

import { useState } from "react";
import type { CampaignPlan } from "@/lib/campaigns/plan";
import { PROMOTES_OPTIONS, type Promotes } from "@/lib/campaigns/objectives";
import { Choice, Question, SubQuestion, TextField } from "./wizard-parts";

const DETAIL_PROMPT: Partial<Record<Promotes, { label: string; placeholder: string }>> = {
  PRODUCT: { label: "Which product?", placeholder: "e.g. Heavyweight black hoodie" },
  SERVICE: { label: "Which service?", placeholder: "e.g. Emergency plumbing repairs" },
  OFFER: { label: "What's the offer?", placeholder: "e.g. 20% off first orders this month" },
  APP: { label: "What's the app called?", placeholder: "e.g. FitTrack" },
  OTHER: { label: "What is it?", placeholder: "In a few words" },
};

/** Step 1 — what's being advertised, and what MAIRO knows about the business. */
export function StepBusiness({
  plan,
  update,
  orgName,
}: {
  plan: CampaignPlan;
  update: (patch: Partial<CampaignPlan>) => void;
  orgName: string;
}) {
  // Answers MAIRO already has are shown, not asked again, until they say to edit.
  const known = Boolean(plan.offering.trim() && plan.targetAudience.trim());
  const [editingBusiness, setEditingBusiness] = useState(!known);
  const [otherBusiness, setOtherBusiness] = useState(plan.businessName !== orgName);
  const detail = plan.promotes ? DETAIL_PROMPT[plan.promotes] : undefined;

  return (
    <Question
      title={orgName ? `Welcome back! Are we advertising ${orgName} today?` : "What business are we advertising?"}
      sub="MAIRO uses what you tell it here to write the ad, pick the audience and check the campaign before anything is spent."
    >
      {orgName && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Choice
            selected={!otherBusiness}
            onClick={() => {
              setOtherBusiness(false);
              update({ businessName: orgName });
            }}
            label={`Yes, ${orgName}`}
          />
          <Choice selected={otherBusiness} onClick={() => setOtherBusiness(true)} label="A different business" />
        </div>
      )}
      {(otherBusiness || !orgName) && (
        <div className="mt-4 max-w-md">
          <TextField
            label="What is the name of your business?"
            value={plan.businessName}
            onChange={(businessName) => update({ businessName })}
          />
        </div>
      )}

      <SubQuestion title="What are we advertising today?">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {PROMOTES_OPTIONS.map((o) => (
            <Choice
              key={o.value}
              selected={plan.promotes === o.value}
              onClick={() => update({ promotes: o.value })}
              label={o.label}
            />
          ))}
        </div>
        {detail && (
          <div className="mt-4 max-w-md">
            <TextField
              label={detail.label}
              value={plan.promotesDetail}
              onChange={(promotesDetail) => update({ promotesDetail })}
              placeholder={detail.placeholder}
            />
          </div>
        )}
      </SubQuestion>

      <SubQuestion
        title="About your business"
        sub={known && !editingBusiness ? "What MAIRO already knows. Change anything that's out of date." : "Only what's true — MAIRO never invents details for your ads."}
      >
        {!editingBusiness ? (
          <div className="rounded-xl border p-4 text-[13px] leading-relaxed" style={{ borderColor: "var(--mairo-line)", background: "rgba(10,16,32,0.5)" }}>
            <Known label="You sell" value={plan.offering} />
            <Known label="Your customers" value={plan.targetAudience} />
            <Known label="What makes you different" value={plan.differentiator} />
            <Known label="Website" value={plan.website} />
            <button
              type="button"
              onClick={() => setEditingBusiness(true)}
              className="mt-3 text-[12.5px] text-muted underline underline-offset-4 hover:text-white"
            >
              Edit these
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            <TextField label="What does your business sell or offer?" value={plan.offering} onChange={(offering) => update({ offering })} multiline />
            <TextField label="Who are your typical customers?" value={plan.targetAudience} onChange={(targetAudience) => update({ targetAudience })} multiline placeholder="e.g. Local homeowners, mostly 30–60" />
            <TextField label="What makes your business different from competitors?" value={plan.differentiator} onChange={(differentiator) => update({ differentiator })} multiline placeholder="Optional" />
            <TextField label="Do you have a website?" value={plan.website} onChange={(website) => update({ website })} type="url" placeholder="yourbusiness.com — leave empty if not" />
          </div>
        )}
      </SubQuestion>
    </Question>
  );
}

function Known({ label, value }: { label: string; value: string }) {
  return (
    <p className="mt-1 first:mt-0">
      <span className="text-faint">{label}: </span>
      <span className="text-white/90">{value.trim() || "—"}</span>
    </p>
  );
}
