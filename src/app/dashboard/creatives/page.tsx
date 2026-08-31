import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";
import { CreativeRequestForm } from "./creative-request-form";

const statusTone = {
  REQUESTED: "neutral",
  IN_PROGRESS: "yellow",
  IN_REVIEW: "blue",
  APPROVED: "green",
  DELIVERED: "green",
} as const;

export default async function CreativesPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const requests = await db.creativeRequest.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Creatives"
        description="Request ad creative and copy — our team and the Creative agent put it together."
      />

      <Card className="mb-8">
        <CreativeRequestForm />
      </Card>

      {requests.length === 0 ? (
        <EmptyState title="No creative requests yet" description="Request your first one above." />
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-neutral-400">
                  {r.type} · {r.month}
                </p>
                <p className="mt-1">{r.brief}</p>
              </div>
              <Badge tone={statusTone[r.status]}>{r.status.replace("_", " ")}</Badge>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
