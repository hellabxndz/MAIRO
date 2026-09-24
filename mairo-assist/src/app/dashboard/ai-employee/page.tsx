import { Bot } from "lucide-react";
import type { Metadata } from "next";
import { EditorForm } from "@/components/ai-employee/editor-form";
import { PreviewChat } from "@/components/ai-employee/preview-chat";
import { PublishBar } from "@/components/ai-employee/publish-bar";
import { VersionsList, type VersionRow } from "@/components/ai-employee/versions-list";
import { AiStatusControl } from "@/components/dashboard/ai-status-control";
import { PageHeader } from "@/components/dashboard/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { WidgetPreview } from "@/components/widget/widget-preview";
import type { StoredMessage } from "@/lib/ai/turn";
import { isOpenAIConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { requireBusiness } from "@/lib/tenancy/context";
import { formatDateTime } from "@/lib/utils";
import { parseAiConfig } from "@/lib/validation/ai-employee";

export const metadata: Metadata = { title: "AI Employee" };

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${k}:${stable((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export default async function AiEmployeePage({ searchParams }: PageProps<"/dashboard/ai-employee">) {
  const ctx = await requireBusiness("ai.view");
  const { r: restored } = await searchParams;
  const supabase = await createClient();
  const { data: employee } = await supabase
    .from("ai_employees")
    .select("id, name, avatar_url, status, draft_config, published_version_id, tested_at, draft_saved_at")
    .eq("business_id", ctx.business.id)
    .maybeSingle();

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

  const canConfigure = ctx.permissions.has("ai.configure");
  const config = parseAiConfig(employee.draft_config);

  const [versionsRes, previewRes] = await Promise.all([
    canConfigure
      ? supabase
          .from("ai_employee_versions")
          .select("id, version, name, config, note, published_at, author:users(full_name, email)")
          .eq("ai_employee_id", employee.id)
          .order("version", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as never[] }),
    canConfigure
      ? supabase
          .from("conversations")
          .select("id")
          .eq("business_id", ctx.business.id)
          .eq("channel", "preview")
          .eq("preview_user_id", ctx.user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const versions = versionsRes.data ?? [];
  const live = versions.find((v) => v.id === employee.published_version_id);
  const hasUnpublished = !live || live.name !== employee.name || stable(parseAiConfig(live.config)) !== stable(config);
  const testedSinceSave = Boolean(employee.tested_at && employee.tested_at >= employee.draft_saved_at);

  let previewMessages: StoredMessage[] = [];
  if (previewRes.data) {
    const { data } = await supabase
      .from("conversation_messages")
      .select("id, sender_type, content, sources, tool_names, created_at")
      .eq("conversation_id", previewRes.data.id)
      .order("created_at");
    previewMessages = (data ?? []) as StoredMessage[];
  }

  const versionRows: VersionRow[] = versions.map((v) => {
    const author = (Array.isArray(v.author) ? v.author[0] : v.author) as { full_name: string | null; email: string } | null;
    return { id: v.id, version: v.version, note: v.note, publishedAt: formatDateTime(v.published_at), by: author?.full_name || author?.email || null, live: v.id === employee.published_version_id };
  });

  const statusTone = employee.status === "active" ? "success" : employee.status === "paused" ? "warning" : "neutral";

  return (
    <div className="space-y-6">
      <PageHeader
        title={employee.name}
        description={<span className="flex items-center gap-2">Your AI employee&apos;s personality, instructions and status. <Badge tone={statusTone}>{employee.status === "draft" ? "not live" : employee.status}</Badge></span>}
        actions={<AiStatusControl status={employee.status} canActivate={Boolean(employee.tested_at && employee.published_version_id)} canToggle={ctx.permissions.has("ai.toggle")} />}
      />

      {canConfigure ? (
        <>
          <PublishBar hasUnpublished={hasUnpublished} testedSinceSave={testedSinceSave} canPublish={ctx.permissions.has("ai.publish")} />
          <div className="grid items-start gap-6 xl:grid-cols-[1fr_380px]">
            <EditorForm key={`restored-${typeof restored === "string" ? restored : 0}`} name={employee.name} avatarUrl={employee.avatar_url} config={config} />
            <div className="space-y-4 xl:sticky xl:top-24">
              <PreviewChat
                key={previewRes.data?.id ?? "none"}
                name={employee.name}
                welcomeMessage={config.welcomeMessage}
                brandColor={config.brandColor}
                initialMessages={previewMessages}
                enabled={isOpenAIConfigured()}
                disabledReason={isOpenAIConfigured() ? undefined : "The AI engine isn't configured on this deployment yet (OPENAI_API_KEY and OPENAI_MODEL)."}
              />
              <p className="text-xs text-fg-subtle">
                Preview chats use your saved draft, run the real AI with your knowledge base, and never reach customers or your inbox.
                Actions like handing over to a person are simulated.
              </p>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Version history</CardTitle>
              <CardDescription>Every publish is saved. Restore any version to your draft, then publish it again.</CardDescription>
            </CardHeader>
            <CardContent>
              <VersionsList versions={versionRows} canRestore />
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Alert tone="info">Only owners and admins can change the AI employee.</Alert>
          <WidgetPreview name={employee.name} welcomeMessage={config.welcomeMessage} brandColor={config.brandColor} businessName={ctx.business.name} />
        </div>
      )}
    </div>
  );
}
