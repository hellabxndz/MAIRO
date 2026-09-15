import Link from "next/link";
import { db } from "@/lib/db";
import { Card, PageHeader, EmptyState } from "@/components/ui";
import { StatusSelect } from "@/components/status-select";
import { ReviewVerdict } from "@/components/review-verdict";
import { RerunReviewButton } from "@/components/rerun-review-button";
import { updateCreativeStatusAction } from "@/lib/actions/aios-actions";

// Approve and block are missing from this list on purpose — see MANUAL_STATUSES
// in aios-actions.ts. They are the safety reviewer's verdicts, not a dropdown.
const FULFILMENT_STATUSES = ["REQUESTED", "IN_PROGRESS", "DELIVERED"];

export default async function CreativePipelinePage() {
  const requests = await db.creativeRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: { organization: true },
  });

  const stuck = requests.filter((r) => r.status === "IN_REVIEW").length;

  return (
    <div>
      <PageHeader
        title="Creative pipeline"
        description="Every creative request across every client, oldest first within each status. Approving and blocking is done by the safety check, not here."
      />

      {stuck > 0 && (
        <Card className="mb-6 border-amber-400/20 bg-amber-400/5">
          <p className="font-medium">
            {stuck} request{stuck === 1 ? "" : "s"} couldn&apos;t be checked
          </p>
          <p className="mt-1.5 text-sm text-neutral-400">
            These are not waiting for your approval. The safety reviewer was unreachable when
            their concepts were written, so they stopped rather than going live unchecked. If
            every request is landing here, the AI key is missing or failing in production —
            check it on{" "}
            <Link href="/aios/setup" className="underline">
              setup
            </Link>
            .
          </p>
        </Card>
      )}

      {requests.length === 0 ? (
        <EmptyState title="Nothing in the pipeline" />
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <Card key={r.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <Link
                  href={`/aios/organizations/${r.organizationId}`}
                  className="text-sm font-medium hover:underline"
                >
                  {r.organization.name}
                </Link>
                <p className="text-sm text-neutral-500">
                  {r.type} · {r.month}
                </p>
                <p className="mt-1">{r.brief}</p>
                <ReviewVerdict
                  status={r.status}
                  reviewedAt={r.reviewedAt}
                  reviewCategory={r.reviewCategory}
                  reviewNotes={r.reviewNotes}
                />
              </div>

              {r.status === "IN_REVIEW" || r.status === "BLOCKED" ? (
                <RerunReviewButton
                  requestId={r.id}
                  organizationId={r.organizationId}
                  label={r.status === "BLOCKED" ? "Check it again" : "Run the check again"}
                />
              ) : (
                <form action={updateCreativeStatusAction.bind(null, r.id, r.organizationId)}>
                  <StatusSelect
                    defaultValue={r.status}
                    options={
                      FULFILMENT_STATUSES.includes(r.status)
                        ? FULFILMENT_STATUSES
                        : [r.status, ...FULFILMENT_STATUSES]
                    }
                  />
                </form>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
