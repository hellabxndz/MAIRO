-- Mairo Assist — conversations, verification, support tickets, approvals,
-- AI tool audit trail.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  -- Opaque, random per-browser identifier issued by the widget. Not PII.
  visitor_id text check (char_length(visitor_id) <= 100),
  channel text not null default 'widget' check (channel in ('widget', 'preview')),
  status text not null default 'new'
    check (status in ('new', 'ai_handling', 'needs_attention', 'human_handling', 'resolved')),
  -- Who answers the customer right now. When 'human', the AI never replies.
  handled_by text not null default 'ai' check (handled_by in ('ai', 'human')),
  assigned_user_id uuid references public.users (id) on delete set null,
  -- Set only after the one-time verification succeeds; scoped to this conversation.
  verified_customer_id uuid references public.customers (id) on delete set null,
  verified_until timestamptz,
  subject text check (char_length(subject) <= 200),
  message_count integer not null default 0,
  last_message_at timestamptz,
  resolved_at timestamptz,
  escalated_at timestamptz,
  content_redacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_human_status check (
    handled_by = 'ai' or status in ('human_handling', 'needs_attention', 'resolved')
  )
);

create index conversations_business_status_idx on public.conversations (business_id, status, last_message_at desc);
create index conversations_business_created_idx on public.conversations (business_id, created_at desc);
create index conversations_customer_idx on public.conversations (customer_id);

create trigger conversations_set_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_type text not null check (sender_type in ('customer', 'ai', 'human', 'system')),
  sender_user_id uuid references public.users (id) on delete set null,
  content text not null check (char_length(content) <= 8000),
  -- Structured attachments shown in the widget, e.g. product cards.
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  -- Merchant-facing: which knowledge/catalog sources informed an AI answer.
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  created_at timestamptz not null default now(),
  constraint messages_human_sender check (sender_type <> 'human' or sender_user_id is not null)
);

create index conversation_messages_conversation_idx on public.conversation_messages (conversation_id, created_at);

-- Messages must belong to the same business as their conversation.
create or replace function public.check_message_business()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.conversations c where c.id = new.conversation_id and c.business_id = new.business_id
  ) then
    raise exception 'Message business does not match conversation business' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger conversation_messages_same_business before insert on public.conversation_messages
  for each row execute function public.check_message_business();

-- One-time order verification codes. Only hashes are stored.
create table public.order_verifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete cascade,
  code_hash text not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index order_verifications_conversation_idx on public.order_verifications (conversation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Support tickets and merchant approval requests
-- ---------------------------------------------------------------------------
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  type text not null check (type in ('general', 'return', 'exchange', 'refund', 'cancellation',
                                     'shipping', 'address_change', 'escalation', 'other')),
  status text not null default 'open' check (status in ('open', 'pending', 'resolved', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  subject text not null check (char_length(subject) <= 200),
  description text check (char_length(description) <= 5000),
  assigned_user_id uuid references public.users (id) on delete set null,
  created_by_type text not null check (created_by_type in ('ai', 'human', 'customer', 'system')),
  created_by_user_id uuid references public.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_tickets_business_status_idx on public.support_tickets (business_id, status, created_at desc);

create trigger support_tickets_set_updated_at before update on public.support_tickets
  for each row execute function public.set_updated_at();

-- A customer request is never permission. Every write operation on an order
-- waits here until an authorized merchant decides, and records exactly what
-- was done and whether Shopify confirmed it.
create table public.order_action_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  ticket_id uuid references public.support_tickets (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  action_type text not null check (action_type in ('return', 'exchange', 'refund', 'cancellation', 'address_change')),
  status text not null default 'awaiting_approval' check (status in (
    'awaiting_approval', 'approved', 'rejected', 'executing', 'completed', 'failed', 'manual_required'
  )),
  request_details jsonb not null default '{}'::jsonb,
  verified_availability jsonb,
  decided_by uuid references public.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 2000),
  executed_action text,
  execution_result jsonb,
  shopify_confirmed boolean not null default false,
  -- Guards against executing the same operation twice.
  idempotency_key text not null unique default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint action_requests_decision check (
    status in ('awaiting_approval') or decided_by is not null or status in ('failed', 'manual_required')
  ),
  constraint action_requests_completed_confirmed check (status <> 'completed' or shopify_confirmed)
);

create index order_action_requests_business_status_idx
  on public.order_action_requests (business_id, status, created_at desc);

create trigger order_action_requests_set_updated_at before update on public.order_action_requests
  for each row execute function public.set_updated_at();

-- Audit trail of every tool the AI asked to run (inputs are redacted by the app).
create table public.ai_tool_executions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  message_id uuid references public.conversation_messages (id) on delete set null,
  tool_name text not null check (char_length(tool_name) <= 80),
  input jsonb not null default '{}'::jsonb,
  output_summary jsonb,
  status text not null check (status in ('success', 'denied', 'invalid_input', 'error')),
  error_code text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index ai_tool_executions_business_idx on public.ai_tool_executions (business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.order_verifications enable row level security;
alter table public.support_tickets enable row level security;
alter table public.order_action_requests enable row level security;
alter table public.ai_tool_executions enable row level security;

create policy conversations_select_member on public.conversations for select to authenticated
  using (public.is_business_member(business_id));
create policy messages_select_member on public.conversation_messages for select to authenticated
  using (public.is_business_member(business_id));
create policy tickets_select_member on public.support_tickets for select to authenticated
  using (public.is_business_member(business_id));
create policy action_requests_select_member on public.order_action_requests for select to authenticated
  using (public.is_business_member(business_id));
create policy tool_executions_select_manager on public.ai_tool_executions for select to authenticated
  using (public.has_business_role(business_id, array['owner', 'admin']));

-- All writes to conversations, messages, tickets and approvals go through the
-- server, which checks role permissions, takeover state and idempotency.
revoke all on public.conversations, public.conversation_messages, public.order_verifications,
  public.support_tickets, public.order_action_requests, public.ai_tool_executions
  from anon;
revoke all on public.order_verifications from authenticated;
revoke insert, update, delete on public.conversations, public.conversation_messages,
  public.support_tickets, public.order_action_requests, public.ai_tool_executions
  from authenticated;

-- Activity feed rows point at real records (kept if the record is removed).
alter table public.activity_logs
  add constraint activity_logs_conversation_fk foreign key (conversation_id)
    references public.conversations (id) on delete set null,
  add constraint activity_logs_customer_fk foreign key (customer_id)
    references public.customers (id) on delete set null,
  add constraint activity_logs_order_fk foreign key (order_id)
    references public.orders (id) on delete set null;
