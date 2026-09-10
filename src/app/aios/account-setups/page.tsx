import Link from "next/link";
import { db } from "@/lib/db";
import { Card, PageHeader, EmptyState, Badge, inputClass, primaryButtonClass } from "@/components/ui";
import { updateManagedSetupAction } from "@/lib/actions/aios-actions";
import { SETUP_STATUS_COPY } from "@/lib/tiktok/managed-setup";
import { platformName } from "@/lib/ad-platforms/registry";

// The queue behind "MAIRO sets your TikTok up for you".
//
// This page is the feature. There is no API that registers a TikTok account —
// account creation is where TikTok runs its identity and anti-abuse checks and
// is deliberately not automatable — so the promise is kept by a person working
// this list. Everything the customer sees on their own integrations page comes
// from the status and the note set here.

const STATUSES = ["REQUESTED", "IN_PROGRESS", "NEEDS_CUSTOMER", "READY", "DECLINED"] as const;

export default async function AccountSetupsPage() {
  const setups = await db.managedAccountSetup.findMany({
    orderBy: [{ status: "asc" }, { requestedAt: "asc" }],
    include: { organization: { select: { id: true, name: true, subscriptionTier: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Account setups"
        description="Businesses that asked MAIRO to build their platform presence for them. Oldest first."
      />

      {setups.length === 0 ? (
        <EmptyState
          title="Nobody waiting"
          description="Requests from the Growth plan and above land here."
        />
      ) : (
        <div className="space-y-3">
          {setups.map((s) => (
            <Card key={s.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Link
                      href={`/aios/organizations/${s.organizationId}`}
                      className="text-sm font-medium text-white hover:underline"
                    >
                      {s.organization.name}
                    </Link>
                    <Badge tone={SETUP_STATUS_COPY[s.status].tone}>
                      {SETUP_STATUS_COPY[s.status].label}
                    </Badge>
                    <span className="text-xs text-neutral-500">
                      {platformName(s.platform)} · {s.organization.subscriptionTier}
                    </span>
                  </div>

                  <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                    <Row label="Account name" value={s.displayName} />
                    <Row label="Wants handle" value={s.preferredHandle ? `@${s.preferredHandle}` : null} />
                    <Row label="Backups" value={s.alternateHandles} />
                    <Row label="Email" value={s.contactEmail} />
                    <Row label="Phone" value={s.contactPhone} />
                    <Row label="Category" value={s.category} />
                    <Row label="Website" value={s.websiteUrl} />
                    <Row label="Bio" value={s.bio} />
                    <Row label="They said" value={s.customerNotes} />
                    <Row label="Asked" value={s.requestedAt.toISOString().slice(0, 10)} />
                  </dl>
                </div>
              </div>

              <form action={updateManagedSetupAction.bind(null, s.id)} className="mt-5 space-y-3 border-t border-white/10 pt-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-neutral-400">Status</span>
                    <select name="status" defaultValue={s.status} className={inputClass}>
                      {STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {SETUP_STATUS_COPY[st].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-neutral-400">Handle created</span>
                    <input
                      name="createdHandle"
                      defaultValue={s.createdHandle ?? ""}
                      className={inputClass}
                      placeholder="marlowbakery"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-neutral-400">Handoff link</span>
                    <input
                      name="handoffUrl"
                      defaultValue={s.handoffUrl ?? ""}
                      className={inputClass}
                      placeholder="https://…"
                    />
                  </label>
                </div>
                <label className="block space-y-1">
                  {/* Shown to the customer verbatim, which is the point — it is
                      how "needs you" turns into something they can act on. */}
                  <span className="text-xs font-medium text-neutral-400">
                    Note to the customer
                  </span>
                  <input
                    name="internalNotes"
                    defaultValue={s.internalNotes ?? ""}
                    className={inputClass}
                    placeholder="e.g. TikTok texted you a code — send it over and we'll finish."
                  />
                </label>
                <button type="submit" className={primaryButtonClass}>
                  Update
                </button>
              </form>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-neutral-500">{label}:</dt>
      <dd className="min-w-0 break-words text-neutral-300">{value}</dd>
    </div>
  );
}
