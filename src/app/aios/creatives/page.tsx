import Link from "next/link";
import { db } from "@/lib/db";
import { Card, PageHeader, EmptyState } from "@/components/ui";
import { StatusSelect } from "@/components/status-select";
import { updateCreativeStatusAction } from "@/lib/actions/aios-actions";

const CREATIVE_STATUSES = ["REQUESTED", "IN_PROGRESS", "IN_REVIEW", "APPROVED", "DELIVERED"];

export default async function CreativePipelinePage() {
  const requests = await db.creativeRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: { organization: true },
  });

  return (
    <div>
      <PageHeader
        title="Creative pipeline"
        description="Every creative request across every client, oldest first within each status."
      />

      {requests.length === 0 ? (
        <EmptyState title="Nothing in the pipeline" />
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <Card key={r.id} className="flex items-center justify-between py-3">
              <div>
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
              </div>
              <form action={updateCreativeStatusAction.bind(null, r.id, r.organizationId)}>
                <StatusSelect defaultValue={r.status} options={CREATIVE_STATUSES} />
              </form>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
