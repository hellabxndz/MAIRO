"use client";

import Link from "next/link";
import type { AdDestination, AdGoal, MessageChannel } from "@/generated/prisma/enums";
import type { CampaignPlan } from "@/lib/campaigns/plan";
import { GOAL_OPTIONS, destinationsForService, goalOption } from "@/lib/campaigns/objectives";
import { Choice, Note, Question, SubQuestion, TextField } from "./wizard-parts";

const CHANNELS: { value: MessageChannel; label: string; sub: string }[] = [
  { value: "MESSENGER", label: "Messenger", sub: "Opens a chat with your Facebook Page" },
  { value: "INSTAGRAM", label: "Instagram Direct", sub: "Needs Instagram linked to your Page" },
  { value: "WHATSAPP", label: "WhatsApp", sub: "Needs WhatsApp connected to your Page" },
];

/** Step 2 — what the ad should do, and where people go. */
export function StepGoal({
  plan,
  update,
  recommended,
  pixelActive,
  businessPhone,
  mode,
}: {
  plan: CampaignPlan;
  update: (patch: Partial<CampaignPlan>) => void;
  recommended: AdGoal;
  pixelActive: boolean;
  businessPhone: string | null;
  mode: "simple" | "advanced";
}) {
  const metaOnlyBlocked = plan.service !== "meta";

  function chooseGoal(goal: AdGoal) {
    // A destination the new goal can't use is cleared rather than kept.
    const allowed = destinationsForService(goal, plan.service).map((d) => d.type);
    const keep = plan.destinationType && allowed.includes(plan.destinationType);
    update({ goal, ...(keep ? {} : { destinationType: allowed.length === 1 ? allowed[0] : null, destinationValue: allowed[0] === "WEBSITE" ? plan.website : "" }) });
  }

  function chooseDestination(type: AdDestination) {
    const value =
      type === "WEBSITE" ? plan.destinationValue || plan.website : type === "PHONE_CALL" ? businessPhone ?? "" : type === "APP" ? plan.destinationValue : "";
    update({ destinationType: type, destinationValue: plan.destinationType === type ? plan.destinationValue : value });
  }

  return (
    <Question
      title="What would you like this advertisement to accomplish?"
      sub="Pick the result you want. MAIRO turns it into the right Meta campaign settings for you."
    >
      <div className="grid gap-2.5 sm:grid-cols-2">
        {GOAL_OPTIONS.map((g) => (
          <Choice
            key={g.goal}
            selected={plan.goal === g.goal}
            onClick={() => chooseGoal(g.goal)}
            label={g.label}
            sub={g.metaOnly && metaOnlyBlocked ? `${g.description} Meta only.` : g.description}
            badge={g.goal === recommended ? "AI Recommended" : null}
            disabled={g.metaOnly && metaOnlyBlocked}
            note={mode === "advanced" ? `Meta objective: ${g.metaObjective}` : null}
          />
        ))}
      </div>

      {(plan.goal === "SALES" || plan.goal === "TRAFFIC") && (
        <div className="mt-4">
          <Note>
            If your main goal is purchases, we recommend optimizing for sales rather than simply paying for website
            visitors — Meta then looks for people likely to buy, not just click.
          </Note>
        </div>
      )}
      {plan.goal === "SALES" && !pixelActive && (
        <div className="mt-3">
          <Note tone="warn">
            Your website may need additional tracking setup so we can measure purchases accurately. Until Meta sees
            purchases from your site, MAIRO optimizes this campaign for website visits instead.{" "}
            <Link href="/dashboard/tracking" className="underline underline-offset-4">
              Set up tracking
            </Link>
          </Note>
        </div>
      )}

      {plan.goal && (
        <SubQuestion
          title="Where would you like people to go when they interact with your advertisement?"
          sub={
            plan.service === "meta"
              ? `Only destinations that work for "${goalOption(plan.goal).label}" are shown.`
              : "TikTok ads send people to a website, so that's the destination for this campaign."
          }
        >
          <div className="grid gap-2.5 sm:grid-cols-2">
            {destinationsForService(plan.goal, plan.service).map((d) => (
              <Choice
                key={d.type}
                selected={plan.destinationType === d.type}
                onClick={() => chooseDestination(d.type)}
                label={d.label}
                sub={d.sub}
              />
            ))}
          </div>

          <div className="mt-5 max-w-lg">
            {plan.destinationType === "WEBSITE" && (
              <TextField
                label="What page should customers visit?"
                value={plan.destinationValue}
                onChange={(destinationValue) => update({ destinationValue })}
                type="url"
                placeholder="yourbusiness.com/the-product"
                hint="MAIRO checks the page loads and works on phones before you spend anything."
              />
            )}
            {plan.destinationType === "PHONE_CALL" && (
              <TextField
                label="What number should people call?"
                value={plan.destinationValue}
                onChange={(destinationValue) => update({ destinationValue })}
                type="tel"
                placeholder="(555) 123-4567"
              />
            )}
            {plan.destinationType === "DIRECT_MESSAGE" && (
              <div className="grid gap-2.5 sm:grid-cols-3">
                {CHANNELS.map((c) => (
                  <Choice
                    key={c.value}
                    selected={plan.messageChannel === c.value}
                    onClick={() => update({ messageChannel: c.value })}
                    label={c.label}
                    sub={c.sub}
                  />
                ))}
              </div>
            )}
            {plan.destinationType === "LEAD_FORM" && (
              <Note>MAIRO writes a short enquiry form for your business. People leave their details and you see them under Leads.</Note>
            )}
            {plan.destinationType === "POST_ENGAGEMENT" && (
              <Note>The ad asks people to react to it — like, comment and share. Works best with a post people already liked.</Note>
            )}
            {plan.destinationType === "APP" && (
              <div className="grid gap-4">
                <TextField
                  label="Your app's store link"
                  value={plan.destinationValue}
                  onChange={(destinationValue) => update({ destinationValue })}
                  type="url"
                  placeholder="apps.apple.com/… or play.google.com/…"
                />
                <TextField
                  label="Your app's Meta app id"
                  value={plan.metaAppId}
                  onChange={(metaAppId) => update({ metaAppId })}
                  placeholder="e.g. 123456789012345"
                  hint="Meta only runs app ads for apps registered with it. Find the id on your app's page at developers.facebook.com."
                />
              </div>
            )}
          </div>
        </SubQuestion>
      )}
    </Question>
  );
}
