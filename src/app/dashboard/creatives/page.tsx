import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";
import { planFor } from "@/lib/plans";
import { currentMonthKey } from "@/lib/utils/month";
import { CreativeRequestForm } from "./creative-request-form";
import { RegenerateConceptButton } from "./regenerate-concept-button";
import { ConceptText } from "@/components/concept-text";
import { ImageStudio } from "./image-studio";
import { ConceptReply } from "./concept-reply";

// A concept is generated inside the request action, and a vision call takes
// longer than the platform default allows.
// Image editing is slower than a text call; give the action room to finish.
export const maxDuration = 120;

const statusTone = {
  REQUESTED: "neutral",
  IN_PROGRESS: "yellow",
  IN_REVIEW: "blue",
  BLOCKED: "red",
  APPROVED: "green",
  DELIVERED: "green",
} as const;

export default async function CreativesPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const organizationId = session.user.organizationId;
  const month = currentMonthKey();

  const [requests, organization, usedThisMonth] = await Promise.all([
    db.creativeRequest.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { images: { orderBy: { version: "desc" } } },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { subscriptionTier: true },
    }),
    // Mirrors requestCreativeAction: blocked requests are not charged.
    db.creativeRequest.count({
      where: { organizationId, month, status: { not: "BLOCKED" } },
    }),
  ]);

  const plan = planFor(organization?.subscriptionTier ?? "NONE");
  const remaining = Math.max(0, plan.limits.creativesPerMonth - usedThisMonth);

  return (
    <div>
      <PageHeader
        title="Creatives"
        description="Request ad creative and copy — our team and the Creative agent put it together."
        action={
          <Badge tone={remaining === 0 ? "yellow" : "neutral"}>
            {usedThisMonth} / {plan.limits.creativesPerMonth} used this month
          </Badge>
        }
      />

      <Card className="mb-8">
        {remaining === 0 ? (
          <div className="space-y-2">
            <p className="font-medium">You&apos;re out of creative requests this month</p>
            <p className="text-sm text-neutral-400">
              The {plan.name} plan includes {plan.limits.creativesPerMonth} a month. They reset
              on the 1st — or upgrade your plan for more.
            </p>
          </div>
        ) : (
          <CreativeRequestForm />
        )}
      </Card>

      {requests.length === 0 ? (
        <EmptyState title="No creative requests yet" description="Request your first one above." />
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-neutral-400">
                    {r.type} · {r.month}
                  </p>
                  <p className="mt-1">{r.brief}</p>
                </div>
                <Badge tone={statusTone[r.status]}>{r.status.replace("_", " ")}</Badge>
              </div>

              {r.status === "BLOCKED" ? (
                <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/[0.06] p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-red-300">
                    Can&apos;t run this one{r.reviewCategory ? ` · ${r.reviewCategory}` : ""}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-300">
                    {r.reviewNotes}
                  </p>
                  <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                    Every ad is checked against Meta&apos;s advertising policies before we
                    approve it. Running this would put your ad account at risk. Change the
                    brief and request it again — this one didn&apos;t use up any of your monthly requests.
                  </p>
                </div>
              ) : (
                (r.referenceImage || r.aiConcept) && (
                  <div className="mt-5 flex flex-col gap-5 border-t border-white/10 pt-5 sm:flex-row">
                    {r.referenceImage && (
                      <div className="shrink-0">
                        <p className="mb-2 text-xs uppercase tracking-[0.12em] text-neutral-600">
                          Your reference
                        </p>
                        {/* eslint-disable-next-line @next/next/no-img-element -- stored
                            as a data URL, so there is no remote origin to optimise. */}
                        <img
                          src={r.referenceImage}
                          alt="Reference supplied with this request"
                          className="max-h-44 rounded-lg border border-white/10 object-contain"
                        />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="mb-2 text-xs uppercase tracking-[0.12em] text-neutral-600">
                        Concept
                      </p>
                      {r.aiConcept ? (
                        <>
                          <ConceptText text={r.aiConcept} />
                          {r.status === "APPROVED" && (
                            <p className="mt-4 border-t border-white/10 pt-3 text-xs text-neutral-600">
                              Approved automatically — checked against Meta&apos;s advertising
                              policies and our safety rules before it reached you.
                            </p>
                          )}
                          {r.status === "IN_REVIEW" && (
                            <p className="mt-4 border-t border-white/10 pt-3 text-xs text-amber-300/80">
                              The automatic policy check couldn&apos;t run on this one, so a
                              person is looking at it before it&apos;s approved.
                            </p>
                          )}

                          <ConceptReply creativeRequestId={r.id} />

                          {r.status === "APPROVED" && (
                            <div className="mt-6 border-t border-white/10 pt-5">
                              <ImageStudio
                                creativeRequestId={r.id}
                                hasReference={Boolean(r.referenceImage)}
                                images={r.images.map((i) => ({
                                  id: i.id,
                                  version: i.version,
                                  imageData: i.imageData,
                                  instruction: i.instruction,
                                  isFinal: i.isFinal,
                                  reviewNotes: i.reviewNotes,
                                }))}
                              />
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-sm text-neutral-500">
                            No concept yet — the AI didn&apos;t manage to write one.
                          </p>
                          <RegenerateConceptButton creativeRequestId={r.id} />
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
