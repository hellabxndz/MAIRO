-- Mairo Assist — Free plan, AI response credits, self-serve billing.

-- The Free plan is a real subscription row (provider 'none', never charged).
alter table public.subscriptions drop constraint if exists subscriptions_plan_key_check;
alter table public.subscriptions add constraint subscriptions_plan_key_check
  check (plan_key in ('free', 'starter', 'growth', 'pro', 'enterprise'));
alter table public.subscriptions drop constraint if exists subscriptions_provider_check;
alter table public.subscriptions add constraint subscriptions_provider_check
  check (provider in ('none', 'stripe', 'shopify', 'manual'));
-- A free subscription is never tied to a payment provider, and a paid one always is.
alter table public.subscriptions add constraint subscriptions_free_has_no_provider
  check ((plan_key = 'free') = (provider = 'none'));

-- Every business starts on Free, exactly once (subscriptions.business_id is unique).
create or replace function public.start_free_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.subscriptions (business_id, plan_key, status, provider, price_cents, current_period_start)
  values (new.id, 'free', 'active', 'none', 0, now())
  on conflict (business_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.start_free_subscription() from public, anon, authenticated;

create trigger businesses_start_free_subscription after insert on public.businesses
  for each row execute function public.start_free_subscription();

-- Existing businesses without a plan get Free.
insert into public.subscriptions (business_id, plan_key, status, provider, price_cents, current_period_start)
select b.id, 'free', 'active', 'none', 0, now()
from public.businesses b
where not exists (select 1 from public.subscriptions s where s.business_id = b.id);

-- AI responses ("credits"): one per AI reply to a customer, per calendar month.
alter table public.usage_counters add column if not exists ai_responses integer not null default 0
  check (ai_responses >= 0);

create or replace function public.record_ai_response(p_business_id uuid, p_period_start date)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into public.usage_counters as c (business_id, period_start, ai_responses)
  values (p_business_id, p_period_start, 1)
  on conflict (business_id, period_start) do update
    set ai_responses = c.ai_responses + 1, updated_at = now()
  returning ai_responses;
$$;

revoke execute on function public.record_ai_response(uuid, date) from public, anon, authenticated;
grant execute on function public.record_ai_response(uuid, date) to service_role;

-- Members may read their own business's credit usage (not tokens or cost).
create or replace function public.business_credit_usage(p_business_id uuid, p_period_start date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.ai_responses from public.usage_counters c
                   where c.business_id = p_business_id and c.period_start = p_period_start), 0)
  where public.is_business_member(p_business_id);
$$;

revoke execute on function public.business_credit_usage(uuid, date) from public, anon;
grant execute on function public.business_credit_usage(uuid, date) to authenticated;

-- Stripe checkouts: which business started which session, so a completed
-- payment can only ever activate the plan for the business that paid.
create table public.billing_checkouts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  provider text not null check (provider in ('stripe')),
  provider_session_id text not null unique,
  plan_key text not null check (plan_key in ('starter', 'growth', 'pro')),
  status text not null default 'open' check (status in ('open', 'completed', 'expired')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index billing_checkouts_business_idx on public.billing_checkouts (business_id, created_at desc);
alter table public.billing_checkouts enable row level security;
revoke all on public.billing_checkouts from anon, authenticated;
