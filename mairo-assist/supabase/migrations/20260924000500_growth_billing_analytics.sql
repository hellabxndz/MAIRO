-- Mairo Assist — leads, consent, follow-ups, analytics, subscriptions, usage.

-- ---------------------------------------------------------------------------
-- Leads and consent. Outbound follow-up is NOT active in v1: these tables
-- record what a merchant needs to decide eligibility later, and nothing
-- sends messages without a granted, unrevoked consent for that channel.
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  name text check (char_length(name) <= 120),
  email text check (email is null or (email = lower(email) and char_length(email) <= 320)),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'converted', 'lost')),
  source text not null default 'chat' check (source in ('chat', 'manual', 'import')),
  interest text check (char_length(interest) <= 1000),
  notes text check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_business_created_idx on public.leads (business_id, created_at desc);

create trigger leads_set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

create table public.customer_consents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  purpose text not null check (purpose in ('marketing', 'follow_up', 'transactional')),
  status text not null check (status in ('granted', 'revoked')),
  source text not null check (char_length(source) <= 120),  -- e.g. "widget_checkbox_v1"
  evidence jsonb not null default '{}'::jsonb,               -- wording shown, timestamp, page
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint consents_subject check (customer_id is not null or lead_id is not null)
);

create index customer_consents_lookup_idx on public.customer_consents (business_id, customer_id, channel, purpose);

create table public.lead_follow_ups (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'manual')),
  reason text not null check (reason in ('product_interest', 'abandoned_checkout', 'sales_request', 'other')),
  status text not null default 'planned' check (status in ('planned', 'sent', 'skipped', 'failed', 'cancelled')),
  skip_reason text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index lead_follow_ups_lead_idx on public.lead_follow_ups (lead_id);

-- ---------------------------------------------------------------------------
-- Analytics events: actual system activity only. Properties must not carry
-- raw customer personal data (enforced by the app's event writer).
--
-- Attribution rule (documented in docs/ANALYTICS.md): an "ai_attributed_order"
-- event is written only when an order is linked to a conversation in which
-- the AI recommended a product that appears in that order, and the order was
-- placed within the attribution window after that recommendation.
-- ---------------------------------------------------------------------------
create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  event_type text not null check (event_type in (
    'conversation_started', 'conversation_resolved_by_ai', 'conversation_escalated',
    'product_recommended', 'product_link_clicked', 'lead_captured', 'order_lookup',
    'return_request_created', 'exchange_request_created', 'refund_request_created',
    'cancellation_request_created', 'ticket_created', 'ai_attributed_order'
  )),
  conversation_id uuid references public.conversations (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  value numeric(12, 2),
  currency text,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  -- Makes event writes idempotent (e.g. one attributed-order event per order).
  dedupe_key text,
  unique (business_id, dedupe_key)
);

create index analytics_events_business_type_time_idx on public.analytics_events (business_id, event_type, occurred_at desc);
create index analytics_events_business_time_idx on public.analytics_events (business_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Billing. One subscription row per business; exactly one billing provider
-- at a time so a business is never charged twice for the same plan.
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses (id) on delete cascade,
  plan_key text not null check (plan_key in ('starter', 'growth', 'pro', 'enterprise')),
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'paused')),
  provider text not null check (provider in ('stripe', 'shopify', 'manual')),
  provider_customer_id text,
  provider_subscription_id text,
  price_cents integer check (price_cents >= 0),
  currency text not null default 'usd',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_ends_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  provider text not null check (provider in ('stripe', 'shopify', 'manual')),
  provider_invoice_id text not null,
  amount_cents integer not null,
  currency text not null,
  status text not null check (status in ('draft', 'open', 'paid', 'uncollectible', 'void')),
  hosted_url text,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_invoice_id)
);

create index invoices_business_idx on public.invoices (business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- AI usage. usage_records is one row per model request; usage_counters is the
-- per-billing-period rollup that allowance checks read (cheap, O(1)).
-- ---------------------------------------------------------------------------
create table public.usage_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  kind text not null check (kind in ('chat_completion', 'embedding', 'preview')),
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(12, 6) not null default 0,
  provider_cost_usd numeric(12, 6),
  provider_request_id text,
  created_at timestamptz not null default now()
);

create index usage_records_business_time_idx on public.usage_records (business_id, created_at desc);

create table public.usage_counters (
  business_id uuid not null references public.businesses (id) on delete cascade,
  period_start date not null,
  conversations integer not null default 0,
  model_requests integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  estimated_cost_usd numeric(14, 6) not null default 0,
  limit_warning_sent_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (business_id, period_start)
);

-- Record one model request and roll it into the period counter atomically.
create or replace function public.record_ai_usage(
  p_business_id uuid,
  p_conversation_id uuid,
  p_kind text,
  p_model text,
  p_input_tokens integer,
  p_cached_input_tokens integer,
  p_output_tokens integer,
  p_estimated_cost_usd numeric,
  p_period_start date,
  p_provider_request_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.usage_records (business_id, conversation_id, kind, model, input_tokens,
    cached_input_tokens, output_tokens, estimated_cost_usd, provider_request_id)
  values (p_business_id, p_conversation_id, p_kind, p_model, p_input_tokens, p_cached_input_tokens,
    p_output_tokens, p_estimated_cost_usd, p_provider_request_id);

  insert into public.usage_counters as c (business_id, period_start, model_requests, input_tokens,
    output_tokens, estimated_cost_usd)
  values (p_business_id, p_period_start, 1, p_input_tokens, p_output_tokens, p_estimated_cost_usd)
  on conflict (business_id, period_start) do update set
    model_requests = c.model_requests + 1,
    input_tokens = c.input_tokens + excluded.input_tokens,
    output_tokens = c.output_tokens + excluded.output_tokens,
    estimated_cost_usd = c.estimated_cost_usd + excluded.estimated_cost_usd,
    updated_at = now();
end;
$$;

create or replace function public.increment_conversation_usage(p_business_id uuid, p_period_start date)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into public.usage_counters as c (business_id, period_start, conversations)
  values (p_business_id, p_period_start, 1)
  on conflict (business_id, period_start) do update set conversations = c.conversations + 1, updated_at = now()
  returning conversations;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.leads enable row level security;
alter table public.customer_consents enable row level security;
alter table public.lead_follow_ups enable row level security;
alter table public.analytics_events enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.usage_records enable row level security;
alter table public.usage_counters enable row level security;

create policy leads_select_member on public.leads for select to authenticated
  using (public.is_business_member(business_id));
create policy leads_update_member on public.leads for update to authenticated
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy consents_select_member on public.customer_consents for select to authenticated
  using (public.is_business_member(business_id));
create policy follow_ups_select_member on public.lead_follow_ups for select to authenticated
  using (public.is_business_member(business_id));
create policy analytics_select_manager on public.analytics_events for select to authenticated
  using (public.has_business_role(business_id, array['owner', 'admin']));
-- Billing is visible to owners and admins; only owners can change it (via the server).
create policy subscriptions_select_manager on public.subscriptions for select to authenticated
  using (public.has_business_role(business_id, array['owner', 'admin']));
create policy invoices_select_owner on public.invoices for select to authenticated
  using (public.has_business_role(business_id, array['owner']));
create policy usage_records_select_manager on public.usage_records for select to authenticated
  using (public.has_business_role(business_id, array['owner', 'admin']));
create policy usage_counters_select_manager on public.usage_counters for select to authenticated
  using (public.has_business_role(business_id, array['owner', 'admin']));

revoke all on public.leads, public.customer_consents, public.lead_follow_ups, public.analytics_events,
  public.subscriptions, public.invoices, public.usage_records, public.usage_counters
  from anon;
revoke insert, update, delete on public.customer_consents, public.lead_follow_ups, public.analytics_events,
  public.subscriptions, public.invoices, public.usage_records, public.usage_counters
  from authenticated;
revoke insert, delete on public.leads from authenticated;
revoke update on public.leads from authenticated;
grant update (status, notes) on public.leads to authenticated;

revoke execute on function public.record_ai_usage(uuid, uuid, text, text, integer, integer, integer, numeric, date, text)
  from public, anon, authenticated;
revoke execute on function public.increment_conversation_usage(uuid, date) from public, anon, authenticated;
grant execute on function public.record_ai_usage(uuid, uuid, text, text, integer, integer, integer, numeric, date, text)
  to service_role;
grant execute on function public.increment_conversation_usage(uuid, date) to service_role;

-- Plan lookup any member can use for feature gating (no billing details exposed).
create or replace function public.business_plan(p_business_id uuid)
returns table (plan_key text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.plan_key, s.status
  from public.subscriptions s
  where s.business_id = p_business_id and public.is_business_member(p_business_id);
$$;

revoke execute on function public.business_plan(uuid) from public, anon;
grant execute on function public.business_plan(uuid) to authenticated;
