import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, EmptyState } from "@/components/ui";
import { CopyField } from "@/components/copy-field";
import { activeOrganizationId } from "@/lib/active-org";
import { existingLeadForm, leadFormUrl, parseFields, previewLeadForm } from "@/lib/leads/forms";
import { ChooseForm } from "./choose-form";
import { FormBuilder } from "./form-builder";
import { siteUrl } from "@/lib/site";

// What came back from the ads, and the form that collected it.
//
// Nothing is written by opening this page. The form appears the moment somebody
// picks "fill in a form" on a campaign — or presses the button here, for anyone
// who wants to read the questions first. Until then this shows what MAIRO would
// ask, which costs nothing and leaves no public page behind.

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  // Reads, never writes. A form is a public page carrying this business's
  // name; opening a screen to see whether you have one is not a request to be
  // given one. It is created when somebody picks "fill in a form" on a
  // campaign, or presses the button below.
  const form = await existingLeadForm(organizationId);

  const [leads, total, preview] = await Promise.all([
    db.lead.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.lead.count({ where: { organizationId } }),
    form ? Promise.resolve<string[]>([]) : previewLeadForm(organizationId),
  ]);

  const fields = form ? parseFields(form.fieldsJson) : [];
  const url = form ? leadFormUrl(form.slug, siteUrl()) : null;

  return (
    <div>
      <PageHeader
        title="Leads"
        description="People who filled in your form after tapping an ad."
      />

      {!form && (
        <Card className="mb-8">
          <h2 className="text-base text-white">You don&apos;t have a form yet</h2>
          <p className="mb-5 mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-400">
            You don&apos;t have to do anything here — picking &ldquo;Fill in a form&rdquo; on a
            campaign writes one. This is if you&apos;d rather see it first, or write your own.
          </p>
          <ChooseForm preview={preview} />
        </Card>
      )}

      {form && (
      <Card className="mb-8">
        <h2 className="text-base text-white">{form.headline}</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-400">
          {form.description}
        </p>

        <div className="mt-5">
          <p className="mb-2 text-xs uppercase tracking-[0.12em] text-neutral-500">
            Where the ad sends people
          </p>
          <CopyField value={url ?? ""} />
          <p className="mt-2 text-xs text-neutral-600">
            Pick &ldquo;Fill in a form&rdquo; when you create a campaign and MAIRO points the ad
            here for you. You never have to paste this anywhere.
          </p>
        </div>

        <div className="mt-6 border-t border-white/10 pt-5">
          <p className="mb-1 text-xs uppercase tracking-[0.12em] text-neutral-500">
            What it asks
          </p>
          <p className="mb-4 max-w-2xl text-xs leading-relaxed text-neutral-600">
            Change any of it. Short is on purpose though — every question after the third costs
            you completed enquiries, and a lead you can phone beats a detailed answer nobody
            sends.
          </p>
          <FormBuilder leadFormId={form.id} initial={fields} />
        </div>
      </Card>
      )}

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-neutral-300">
          {total} {total === 1 ? "enquiry" : "enquiries"}
        </h2>
        {total > leads.length && (
          <p className="text-xs text-neutral-600">Showing the latest {leads.length}</p>
        )}
      </div>

      {leads.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          description="Run a campaign that sends people to your form and answers land here."
        />
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => {
            const answers = safeAnswers(lead.answersJson);
            return (
              <Card key={lead.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.12em] text-neutral-500">
                    {lead.createdAt.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                  {lead.clickId && (
                    <span className="text-[11px] uppercase tracking-[0.12em] text-emerald-300/70">
                      came from an ad
                    </span>
                  )}
                </div>

                <dl className="mt-3 space-y-2">
                  {fields.map((f) => {
                    const value = answers[f.key];
                    if (!value) return null;
                    return (
                      <div key={f.key} className="flex flex-wrap gap-x-3 text-sm">
                        <dt className="min-w-40 text-neutral-500">{f.label}</dt>
                        <dd className="text-white">{value}</dd>
                      </div>
                    );
                  })}
                </dl>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function safeAnswers(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}
