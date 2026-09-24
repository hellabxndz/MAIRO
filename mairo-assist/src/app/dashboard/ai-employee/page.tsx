import { Bot } from "lucide-react";
import type { Metadata } from "next";
import { AiStatusControl } from "@/components/dashboard/ai-status-control";
import { PageHeader } from "@/components/dashboard/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { WidgetPreview } from "@/components/widget/widget-preview";
import { loadAiEmployee } from "@/lib/dashboard/metrics";
import { requireBusiness } from "@/lib/tenancy/context";
import { formatDateTime } from "@/lib/utils";
import { parseAiConfig } from "@/lib/validation/ai-employee";

export const metadata: Metadata = { title: "AI Employee" };

const LABELS = {
  personality: { professional: "Professional", friendly: "Friendly", luxury: "Luxury", casual: "Casual", energetic: "Energetic", minimal: "Minimal" },
  formality: { casual: "Casual", balanced: "Balanced", formal: "Formal" },
  salesApproach: { helpful_only: "Only when asked", gentle: "Gentle suggestions", proactive: "Proactive" },
  serviceApproach: { concise: "Concise", warm: "Warm", thorough: "Thorough" },
} as const;

export default async function AiEmployeePage() {
  const ctx = await requireBusiness("ai.view");
  const employee = await loadAiEmployee(ctx.business.id);

  if (!employee) {
    return (
      <div>
        <PageHeader title="AI Employee" />
        <EmptyState
          icon={Bot}
          title="You haven't hired your AI employee yet"
          description="Give it a name and a personality in setup — it takes a couple of minutes."
          action={ctx.permissions.has("business.update") ? <ButtonLink href="/onboarding?step=4" size="sm">Name your AI employee</ButtonLink> : undefined}
        />
      </div>
    );
  }

  const config = parseAiConfig(employee.draft_config);
  return (
    <div className="space-y-6">
      <PageHeader
        title={employee.name}
        description="Your AI employee's personality, instructions and status."
        actions={<AiStatusControl status={employee.status} canActivate={Boolean(employee.tested_at && employee.published_version_id)} canToggle={ctx.permissions.has("ai.toggle")} />}
      />
      <Alert tone="info" title="Full customization arrives with AI conversations">
        Editing personality and approach, testing in preview, publishing versions and restoring earlier instructions ship in
        the next release. Your current settings are saved as a draft.
      </Alert>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Current draft <Badge tone={employee.status === "active" ? "success" : employee.status === "paused" ? "warning" : "neutral"}>{employee.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <Item label="Welcome message" value={config.welcomeMessage} />
              <Item label="Personality" value={LABELS.personality[config.personality]} />
              <Item label="Formality" value={LABELS.formality[config.formality]} />
              <Item label="Sales approach" value={LABELS.salesApproach[config.salesApproach]} />
              <Item label="Customer service approach" value={LABELS.serviceApproach[config.serviceApproach]} />
              <Item label="Offer a person when a customer is upset" value={config.escalation.offerHumanWhenUpset ? "Yes" : "No"} />
              <Item label="Last tested" value={employee.tested_at ? formatDateTime(employee.tested_at) : "Not yet"} />
              <Item label="Published" value={employee.published_version_id ? "Yes" : "Not yet"} />
              <div className="sm:col-span-2">
                <Item label="Business instructions" value={config.instructions || "None yet"} pre />
              </div>
            </dl>
          </CardContent>
        </Card>
        <WidgetPreview name={employee.name} welcomeMessage={config.welcomeMessage} brandColor={config.brandColor} businessName={ctx.business.name} />
      </div>
    </div>
  );
}

function Item({ label, value, pre }: { label: string; value: string; pre?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className={pre ? "mt-1 whitespace-pre-wrap text-fg" : "mt-1 text-fg"}>{value}</dd>
    </div>
  );
}
