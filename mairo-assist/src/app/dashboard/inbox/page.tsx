import { ArrowLeft, BookOpen, Bot, Inbox, UserRound, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh, ConversationControls } from "@/components/inbox/conversation-controls";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge, StatusDot } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { requireBusiness } from "@/lib/tenancy/context";
import { cn, formatDateTime, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "AI Inbox" };

const STATUSES = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "ai_handling", label: "AI Handling" },
  { value: "needs_attention", label: "Needs Attention" },
  { value: "human_handling", label: "Human Handling" },
  { value: "resolved", label: "Resolved" },
] as const;
const TONE: Record<string, "neutral" | "violet" | "warning" | "blue" | "success"> = {
  new: "neutral",
  ai_handling: "violet",
  needs_attention: "warning",
  human_handling: "blue",
  resolved: "success",
};
const TOOL_LABELS: Record<string, string> = {
  search_knowledge: "Searched knowledge base",
  get_business_policy: "Read a policy",
  escalate_to_human: "Handed over to your team",
  capture_lead: "Saved a lead",
};
const label = (s: string) => STATUSES.find((x) => x.value === s)?.label ?? s;
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

type Customer = { id: string; name: string | null; email: string | null; lead_status: string; orders_count: number | null; total_spent: number | null; currency: string | null; support_notes: string | null };

export default async function InboxPage({ searchParams }: PageProps<"/dashboard/inbox">) {
  const ctx = await requireBusiness("inbox.view");
  const sp = await searchParams;
  const status = STATUSES.some((s) => s.value === sp.status) ? (sp.status as string) : "all";
  const selectedId = typeof sp.c === "string" && /^[0-9a-f-]{36}$/i.test(sp.c) ? sp.c : null;
  const qs = (c?: string) => {
    const p = new URLSearchParams();
    if (status !== "all") p.set("status", status);
    if (c) p.set("c", c);
    const s = p.toString();
    return s ? `/dashboard/inbox?${s}` : "/dashboard/inbox";
  };

  const supabase = await createClient();
  let list = supabase
    .from("conversations")
    .select("id, status, handled_by, subject, message_count, last_message_at, created_at, customer:customers!conversations_customer_id_fkey(name, email)")
    .eq("business_id", ctx.business.id)
    .neq("channel", "preview")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);
  if (status !== "all") list = list.eq("status", status);
  const { data: conversations, error } = await list;
  if (error) throw new Error("Could not load conversations");

  let selected: {
    id: string;
    status: string;
    handled_by: "ai" | "human";
    created_at: string;
    customer: Customer | null;
    assignee: { full_name: string | null; email: string } | null;
  } | null = null;
  let messages: { id: string; sender_type: string; content: string; sources: { id: string; title: string }[]; tool_names: string[]; created_at: string; author: { full_name: string | null; email: string } | null }[] = [];
  let otherConversations: { id: string; created_at: string; status: string }[] = [];
  let orders: { id: string; name: string; processed_at: string | null; display_status: string | null; total_price: number | null; currency: string | null }[] = [];
  let tickets: { id: string; subject: string; status: string; type: string }[] = [];

  if (selectedId) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, status, handled_by, created_at, customer:customers!conversations_customer_id_fkey(id, name, email, lead_status, orders_count, total_spent, currency, support_notes), assignee:users!conversations_assigned_user_id_fkey(full_name, email)")
      .eq("id", selectedId)
      .eq("business_id", ctx.business.id)
      .neq("channel", "preview")
      .maybeSingle();
    if (conv) {
      selected = { ...conv, handled_by: conv.handled_by as "ai" | "human", customer: one(conv.customer) as Customer | null, assignee: one(conv.assignee) as { full_name: string | null; email: string } | null };
      const [msgs, ticketRes] = await Promise.all([
        supabase
          .from("conversation_messages")
          .select("id, sender_type, content, sources, tool_names, created_at, author:users(full_name, email)")
          .eq("conversation_id", conv.id)
          .order("created_at")
          .limit(500),
        supabase.from("support_tickets").select("id, subject, status, type").eq("conversation_id", conv.id).order("created_at", { ascending: false }),
      ]);
      messages = (msgs.data ?? []).map((m) => ({ ...m, author: one(m.author) as { full_name: string | null; email: string } | null }));
      tickets = ticketRes.data ?? [];
      if (selected.customer) {
        const [others, orderRes] = await Promise.all([
          supabase.from("conversations").select("id, created_at, status").eq("business_id", ctx.business.id).eq("customer_id", selected.customer.id).neq("id", conv.id).order("created_at", { ascending: false }).limit(10),
          ctx.permissions.has("orders.view")
            ? supabase.from("orders").select("id, name, processed_at, display_status, total_price, currency").eq("business_id", ctx.business.id).eq("customer_id", selected.customer.id).order("processed_at", { ascending: false }).limit(5)
            : Promise.resolve({ data: [] }),
        ]);
        otherConversations = others.data ?? [];
        orders = orderRes.data ?? [];
      }
    }
  }

  const listPane = (
    <div className={cn("flex min-h-0 flex-col border-line lg:border-r", selectedId && "hidden lg:flex")}>
      <nav aria-label="Filter by status" className="flex gap-1.5 overflow-x-auto border-b border-line p-3">
        {STATUSES.map((s) => (
          <Link
            key={s.value}
            href={s.value === "all" ? "/dashboard/inbox" : `/dashboard/inbox?status=${s.value}`}
            aria-current={status === s.value ? "page" : undefined}
            className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs", status === s.value ? "border-violet/50 bg-violet/15 text-fg" : "border-line text-fg-muted hover:text-fg")}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      {conversations.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={Inbox}
            title={status === "all" ? "No conversations yet" : "Nothing here"}
            description={status === "all" ? "When your AI employee is live on your store, every customer conversation appears here — and you can take over any of them." : "No conversations have this status right now."}
          />
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto" aria-label="Conversations">
          {conversations.map((c) => {
            const customer = one(c.customer) as { name: string | null; email: string | null } | null;
            return (
              <li key={c.id}>
                <Link href={qs(c.id)} aria-current={c.id === selectedId ? "true" : undefined} className={cn("block space-y-1 px-4 py-3 hover:bg-white/[0.03]", c.id === selectedId && "bg-violet/10")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{customer?.name || customer?.email || "Anonymous visitor"}</span>
                    <span className="shrink-0 text-[11px] text-fg-subtle">{formatDateTime(c.last_message_at ?? c.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={TONE[c.status] ?? "neutral"}>{label(c.status)}</Badge>
                    <span className="text-[11px] text-fg-subtle">{c.handled_by === "human" ? "Team" : "AI"} · {c.message_count} messages</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader title="AI Inbox" description="Every conversation between your customers and your AI employee." />
      <div className="glass grid h-[calc(100dvh-13rem)] min-h-[520px] overflow-hidden rounded-2xl lg:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_300px]">
        {listPane}
        {selected ? (
          <>
            <section aria-label="Conversation" className="flex min-h-0 flex-col">
              <AutoRefresh />
              <header className="flex items-center gap-3 border-b border-line px-4 py-3">
                <Link href={qs()} className="rounded-lg p-1 text-fg-muted hover:bg-white/5 lg:hidden" aria-label="Back to conversations">
                  <ArrowLeft className="size-4" />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{selected.customer?.name || selected.customer?.email || "Anonymous visitor"}</p>
                  <p className="flex items-center gap-2 text-xs text-fg-muted" data-testid="speaking-with">
                    <StatusDot tone={selected.handled_by === "human" ? "warning" : "success"} />
                    {selected.handled_by === "human"
                      ? `Customer is talking to your team${selected.assignee ? ` (${selected.assignee.full_name || selected.assignee.email})` : ""} — AI is silent`
                      : "Customer is talking to the AI"}
                  </p>
                </div>
                <Badge tone={TONE[selected.status] ?? "neutral"}>{label(selected.status)}</Badge>
              </header>
              <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-label="Messages">
                {messages.map((m) =>
                  m.sender_type === "system" ? (
                    <li key={m.id} className="text-center text-[11px] text-fg-subtle">{m.content} · {formatDateTime(m.created_at)}</li>
                  ) : (
                    <li key={m.id} className={cn("flex flex-col", m.sender_type === "customer" ? "items-start" : "items-end")}>
                      <span className="mb-1 flex items-center gap-1 text-[11px] text-fg-subtle">
                        {m.sender_type === "customer" ? <UserRound className="size-3" aria-hidden /> : m.sender_type === "ai" ? <Bot className="size-3" aria-hidden /> : null}
                        {m.sender_type === "customer" ? "Customer" : m.sender_type === "ai" ? "AI" : `${m.author?.full_name || m.author?.email || "Team"} (team)`} · {formatDateTime(m.created_at)}
                      </span>
                      <div
                        className={cn(
                          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm",
                          m.sender_type === "customer" ? "rounded-tl-sm bg-white/[0.06]" : m.sender_type === "ai" ? "rounded-tr-sm bg-violet/20" : "rounded-tr-sm bg-electric/25",
                        )}
                      >
                        {m.content}
                      </div>
                      {m.sender_type === "ai" && (m.tool_names.length > 0 || m.sources.length > 0) && (
                        <div className="mt-1 flex max-w-[85%] flex-wrap justify-end gap-1.5 text-[11px] text-fg-subtle" aria-label="How the AI answered">
                          {[...new Set(m.tool_names)].map((t) => (
                            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5"><Wrench className="size-3" aria-hidden />{TOOL_LABELS[t] ?? t}</span>
                          ))}
                          {m.sources.map((s) => (
                            <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-violet/10 px-2 py-0.5 text-violet-glow"><BookOpen className="size-3" aria-hidden />{s.title}</span>
                          ))}
                        </div>
                      )}
                    </li>
                  ),
                )}
              </ol>
              <ConversationControls
                key={`${selected.id}-${selected.handled_by}-${selected.status}`}
                conversationId={selected.id}
                handledBy={selected.handled_by}
                status={selected.status}
                canTakeOver={ctx.permissions.has("inbox.takeover")}
                canReply={ctx.permissions.has("inbox.reply")}
              />
            </section>
            <aside aria-label="Customer" className="hidden min-h-0 space-y-5 overflow-y-auto border-l border-line p-4 text-sm xl:block">
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-fg-subtle">Customer</p>
                {selected.customer ? (
                  <dl className="space-y-1.5">
                    <div><dt className="sr-only">Name</dt><dd className="font-medium">{selected.customer.name || "Name not shared"}</dd></div>
                    <div><dt className="sr-only">Email</dt><dd className="text-fg-muted">{selected.customer.email || "Email not shared"}</dd></div>
                    <div className="flex gap-2 pt-1">
                      {selected.customer.lead_status !== "none" && <Badge tone="violet">Lead: {selected.customer.lead_status}</Badge>}
                      {selected.customer.orders_count != null && <Badge>{selected.customer.orders_count} orders</Badge>}
                    </div>
                  </dl>
                ) : (
                  <p className="text-fg-muted">Anonymous visitor. Details appear once the customer verifies or shares them.</p>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-fg-subtle">Verified orders</p>
                {orders.length ? (
                  <ul className="space-y-2">
                    {orders.map((o) => (
                      <li key={o.id} className="rounded-xl border border-line p-2.5">
                        <p className="font-medium">{o.name}</p>
                        <p className="text-xs text-fg-muted">{formatDateTime(o.processed_at)} · {(o.display_status ?? "").toLowerCase().replaceAll("_", " ") || "—"} · {formatMoney(o.total_price == null ? null : Number(o.total_price), o.currency ?? "USD")}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-fg-muted">No orders linked to this conversation.</p>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-fg-subtle">Requests</p>
                {tickets.length ? (
                  <ul className="space-y-1.5">{tickets.map((t) => <li key={t.id} className="flex justify-between gap-2"><span className="truncate">{t.subject}</span><Badge>{t.status}</Badge></li>)}</ul>
                ) : (
                  <p className="text-fg-muted">None.</p>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-fg-subtle">Previous conversations</p>
                {otherConversations.length ? (
                  <ul className="space-y-1.5">
                    {otherConversations.map((c) => (
                      <li key={c.id}><Link className="flex justify-between gap-2 hover:text-fg" href={qs(c.id)}><span className="text-fg-muted">{formatDateTime(c.created_at)}</span><Badge tone={TONE[c.status] ?? "neutral"}>{label(c.status)}</Badge></Link></li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-fg-muted">None.</p>
                )}
              </div>
            </aside>
          </>
        ) : (
          <div className="hidden items-center justify-center p-8 text-center text-sm text-fg-muted lg:flex xl:col-span-2">
            {selectedId ? "That conversation isn't available." : "Select a conversation to read it, reply, or take over from the AI."}
          </div>
        )}
      </div>
    </div>
  );
}
