-- Mairo Assist — core tenancy, identity, roles, audit, jobs and rate limits.
--
-- Conventions used by every migration in this folder:
--   * Internal IDs are uuid (gen_random_uuid()).
--   * Every tenant-owned row carries business_id, with a foreign key to
--     businesses and ON DELETE CASCADE so deleting a business removes its data.
--   * External Shopify IDs are stored as the GraphQL global ID text
--     ("gid://shopify/Product/123") in a column named shopify_gid, unique per
--     business.
--   * Enumerations are text + CHECK constraints (easier to evolve than enums).
--   * RLS is enabled on every table. Tables that hold secrets or system state
--     have RLS on and NO policies, and are revoked from anon/authenticated,
--     so only the server's service role can touch them.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- users: the application profile for an auth.users row.
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text check (char_length(full_name) <= 120),
  avatar_url text check (char_length(avatar_url) <= 2048),
  dashboard_view text not null default 'simple' check (dashboard_view in ('simple', 'advanced')),
  last_business_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();

-- Create / sync the profile whenever Supabase Auth creates or changes a user.
create or replace function public.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.users (id, email, full_name)
    values (
      new.id,
      lower(new.email),
      nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), '')
    )
    on conflict (id) do nothing;
  elsif tg_op = 'UPDATE' and new.email is distinct from old.email then
    update public.users set email = lower(new.email) where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_auth_user_change();
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_auth_user_change();

-- ---------------------------------------------------------------------------
-- Platform administrators (Mairo Assist staff). Service role only.
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references public.users (id) on delete cascade,
  role text not null check (role in ('superadmin', 'operations', 'support', 'finance')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- businesses: the tenant.
-- ---------------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'),
  website_url text check (char_length(website_url) <= 2048),
  industry text check (char_length(industry) <= 80),
  description text check (char_length(description) <= 2000),
  sells text[] not null default '{}'
    check (sells <@ array['physical', 'digital', 'services', 'other']::text[]),
  ai_goals text[] not null default '{}'
    check (ai_goals <@ array['customer_support', 'sales_assistance', 'product_recommendations',
                             'order_tracking', 'returns_exchanges', 'lead_collection']::text[]),
  status text not null default 'active' check (status in ('active', 'suspended', 'deletion_requested')),
  deletion_requested_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger businesses_set_updated_at before update on public.businesses
  for each row execute function public.set_updated_at();

alter table public.users
  add constraint users_last_business_fk foreign key (last_business_id)
  references public.businesses (id) on delete set null;

-- ---------------------------------------------------------------------------
-- business_members: who belongs to which business, with which role.
-- `permissions` holds optional extra grants for admins (validated in the app
-- against a fixed grantable list; never grants billing management).
-- ---------------------------------------------------------------------------
create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'support_agent')),
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index business_members_user_idx on public.business_members (user_id);

create trigger business_members_set_updated_at before update on public.business_members
  for each row execute function public.set_updated_at();

-- A business must always keep at least one owner.
create or replace function public.ensure_business_keeps_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    -- Cascading delete of the whole business is fine.
    if not exists (select 1 from public.businesses b where b.id = old.business_id) then
      return coalesce(new, old);
    end if;
    if not exists (
      select 1 from public.business_members m
      where m.business_id = old.business_id and m.role = 'owner' and m.id <> old.id
    ) then
      raise exception 'A business must keep at least one owner' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger business_members_keep_owner
  before update of role or delete on public.business_members
  for each row execute function public.ensure_business_keeps_owner();

-- ---------------------------------------------------------------------------
-- RLS helper functions. SECURITY DEFINER so policies on business_members do
-- not recurse. They only ever answer about the *calling* user (auth.uid()).
-- ---------------------------------------------------------------------------
create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    join public.businesses b on b.id = m.business_id
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and b.status <> 'suspended'
  );
$$;

create or replace function public.has_business_role(p_business_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    join public.businesses b on b.id = m.business_id
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.role = any (p_roles)
      and b.status <> 'suspended'
  );
$$;

create or replace function public.shares_business_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members mine
    join public.business_members theirs on theirs.business_id = mine.business_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;

-- ---------------------------------------------------------------------------
-- business_settings: one row per business; onboarding progress lives here.
-- ---------------------------------------------------------------------------
create table public.business_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  onboarding_step smallint not null default 1 check (onboarding_step between 1 and 9),
  onboarding_completed_at timestamptz,
  shopify_step_skipped boolean not null default false,
  timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  support_email text check (char_length(support_email) <= 320),
  escalation_email text check (char_length(escalation_email) <= 320),
  -- How long conversation content is kept before the retention job removes it.
  conversation_retention_days integer not null default 365
    check (conversation_retention_days between 30 and 3650),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger business_settings_set_updated_at before update on public.business_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- business_invitations: owner-issued invites. Only a SHA-256 hash of the
-- token is stored; the plain token is shown once to the inviter.
-- ---------------------------------------------------------------------------
create table public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 320),
  role text not null check (role in ('admin', 'support_agent')),
  token_hash text not null unique,
  invited_by uuid references public.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index business_invitations_one_pending_idx
  on public.business_invitations (business_id, email)
  where accepted_at is null and revoked_at is null;

-- ---------------------------------------------------------------------------
-- Audit logs: append-only record of important administrative actions.
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,
  actor_type text not null check (actor_type in ('user', 'platform_admin', 'system', 'ai')),
  actor_user_id uuid references public.users (id) on delete set null,
  action text not null check (char_length(action) <= 120),
  target_type text check (char_length(target_type) <= 60),
  target_id text check (char_length(target_id) <= 200),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_business_created_idx on public.audit_logs (business_id, created_at desc);

create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Rows vanish only through the cascade when their business is deleted.
  if tg_op = 'DELETE' and not exists (select 1 from public.businesses b where b.id = old.business_id) then
    return old;
  end if;
  raise exception 'audit_logs is append-only' using errcode = 'P0001';
end;
$$;

create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function public.prevent_audit_mutation();

-- ---------------------------------------------------------------------------
-- Activity logs: the merchant-facing activity feed. Only written by the
-- server when an event actually happened.
-- ---------------------------------------------------------------------------
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  type text not null check (char_length(type) <= 60),
  summary text not null check (char_length(summary) <= 500),
  conversation_id uuid,
  customer_id uuid,
  order_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_logs_business_created_idx on public.activity_logs (business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Background jobs: a Postgres-backed queue (webhook processing, syncs,
-- retention). Claimed with FOR UPDATE SKIP LOCKED, retried with backoff.
-- ---------------------------------------------------------------------------
create table public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,
  type text not null check (char_length(type) <= 80),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'dead')),
  idempotency_key text unique,
  run_at timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 8 check (max_attempts between 1 and 50),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index background_jobs_ready_idx on public.background_jobs (run_at) where status in ('queued', 'running');
create index background_jobs_failed_idx on public.background_jobs (updated_at desc) where status in ('failed', 'dead');

create trigger background_jobs_set_updated_at before update on public.background_jobs
  for each row execute function public.set_updated_at();

-- Claim up to p_limit runnable jobs. A job stuck in 'running' for more than
-- p_stale_seconds (a crashed worker) becomes claimable again.
create or replace function public.claim_background_jobs(p_worker text, p_limit integer default 10, p_stale_seconds integer default 600)
returns setof public.background_jobs
language sql
security definer
set search_path = ''
as $$
  update public.background_jobs j
  set status = 'running', locked_at = now(), locked_by = p_worker, attempts = j.attempts + 1
  where j.id in (
    select id from public.background_jobs
    where run_at <= now()
      and (status = 'queued'
           or (status = 'running' and locked_at < now() - make_interval(secs => p_stale_seconds)))
    order by run_at
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  )
  returning j.*;
$$;

-- Record a job failure: retry with exponential backoff, or mark dead.
create or replace function public.fail_background_job(p_job_id uuid, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.background_jobs
  set status = case when attempts >= max_attempts then 'dead' else 'queued' end,
      run_at = now() + make_interval(secs => least(3600, (30 * power(2, least(attempts, 10)))::integer)),
      locked_at = null,
      locked_by = null,
      last_error = left(p_error, 2000)
  where id = p_job_id;
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting: fixed-window counters keyed by an opaque string
-- (e.g. "widget:ip:<hash>"). Returns true when the hit is allowed.
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: create a business and make the caller its owner, atomically.
-- ---------------------------------------------------------------------------
create or replace function public.create_business(
  p_name text,
  p_website_url text default null,
  p_industry text default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_base text;
  v_slug text;
  v_business uuid;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if (select count(*) from public.business_members where user_id = v_user and role = 'owner') >= 10 then
    raise exception 'Business limit reached' using errcode = 'P0001';
  end if;

  v_base := trim(both '-' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'));
  v_base := left(coalesce(nullif(v_base, ''), 'business'), 48);
  v_base := trim(both '-' from v_base);
  v_slug := v_base;
  while exists (select 1 from public.businesses where slug = v_slug) loop
    v_slug := v_base || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
  end loop;

  insert into public.businesses (name, slug, website_url, industry, description, created_by)
  values (trim(p_name), v_slug, nullif(trim(p_website_url), ''), nullif(trim(p_industry), ''),
          nullif(trim(p_description), ''), v_user)
  returning id into v_business;

  insert into public.business_members (business_id, user_id, role) values (v_business, v_user, 'owner');
  insert into public.business_settings (business_id, onboarding_step) values (v_business, 2);
  update public.users set last_business_id = v_business where id = v_user;

  insert into public.audit_logs (business_id, actor_type, actor_user_id, action, target_type, target_id)
  values (v_business, 'user', v_user, 'business.created', 'business', v_business::text);

  return v_business;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: accept an invitation addressed to the caller's verified email.
-- ---------------------------------------------------------------------------
create or replace function public.accept_business_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_inv public.business_invitations;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_inv
  from public.business_invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if v_inv.id is null or v_inv.revoked_at is not null or v_inv.accepted_at is not null
     or v_inv.expires_at < now() then
    raise exception 'This invitation is invalid or has expired' using errcode = 'P0001';
  end if;
  if v_inv.email <> v_email then
    raise exception 'This invitation was sent to a different email address' using errcode = 'P0001';
  end if;

  insert into public.business_members (business_id, user_id, role)
  values (v_inv.business_id, v_user, v_inv.role)
  on conflict (business_id, user_id) do nothing;

  update public.business_invitations
  set accepted_at = now(), accepted_by = v_user
  where id = v_inv.id;

  update public.users set last_business_id = v_inv.business_id where id = v_user;

  insert into public.audit_logs (business_id, actor_type, actor_user_id, action, target_type, target_id, metadata)
  values (v_inv.business_id, 'user', v_user, 'team.invitation_accepted', 'invitation', v_inv.id::text,
          jsonb_build_object('role', v_inv.role));

  return v_inv.business_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: list / revoke the caller's own Auth sessions (device management).
-- ---------------------------------------------------------------------------
create or replace function public.list_my_sessions()
returns table (id uuid, created_at timestamptz, updated_at timestamptz, user_agent text, ip text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.created_at, coalesce(s.refreshed_at::timestamptz, s.updated_at), s.user_agent, host(s.ip)
  from auth.sessions s
  where s.user_id = auth.uid()
  order by coalesce(s.refreshed_at::timestamptz, s.updated_at) desc nulls last
  limit 50;
$$;

create or replace function public.revoke_my_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from auth.sessions where id = p_session_id and user_id = auth.uid();
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.platform_admins enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.business_settings enable row level security;
alter table public.business_invitations enable row level security;
alter table public.audit_logs enable row level security;
alter table public.activity_logs enable row level security;
alter table public.background_jobs enable row level security;
alter table public.rate_limits enable row level security;

-- users
create policy users_select_self_or_teammate on public.users for select to authenticated
  using (id = (select auth.uid()) or public.shares_business_with(id));
create policy users_update_self on public.users for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- businesses
create policy businesses_select_member on public.businesses for select to authenticated
  using (public.is_business_member(id));
create policy businesses_update_manager on public.businesses for update to authenticated
  using (public.has_business_role(id, array['owner', 'admin']))
  with check (public.has_business_role(id, array['owner', 'admin']));

-- business_members
create policy members_select_same_business on public.business_members for select to authenticated
  using (public.is_business_member(business_id));
create policy members_update_owner on public.business_members for update to authenticated
  using (public.has_business_role(business_id, array['owner']))
  with check (public.has_business_role(business_id, array['owner']));
create policy members_delete_owner_or_self on public.business_members for delete to authenticated
  using (public.has_business_role(business_id, array['owner']) or user_id = (select auth.uid()));

-- business_settings
create policy settings_select_member on public.business_settings for select to authenticated
  using (public.is_business_member(business_id));
create policy settings_update_manager on public.business_settings for update to authenticated
  using (public.has_business_role(business_id, array['owner', 'admin']))
  with check (public.has_business_role(business_id, array['owner', 'admin']));

-- business_invitations (owners manage the team)
create policy invitations_select_owner on public.business_invitations for select to authenticated
  using (public.has_business_role(business_id, array['owner']));
create policy invitations_insert_owner on public.business_invitations for insert to authenticated
  with check (public.has_business_role(business_id, array['owner']) and invited_by = (select auth.uid()));
create policy invitations_update_owner on public.business_invitations for update to authenticated
  using (public.has_business_role(business_id, array['owner']))
  with check (public.has_business_role(business_id, array['owner']));

-- audit / activity
create policy audit_select_manager on public.audit_logs for select to authenticated
  using (public.has_business_role(business_id, array['owner', 'admin']));
create policy activity_select_member on public.activity_logs for select to authenticated
  using (public.is_business_member(business_id));

-- platform_admins, background_jobs, rate_limits: no policies (service role only).

-- ---------------------------------------------------------------------------
-- Privileges. Supabase grants broad table privileges to anon/authenticated by
-- default; RLS is the real gate, but narrow the surface anyway.
-- ---------------------------------------------------------------------------
revoke all on public.users, public.platform_admins, public.businesses, public.business_members,
  public.business_settings, public.business_invitations, public.audit_logs, public.activity_logs,
  public.background_jobs, public.rate_limits
  from anon;
revoke all on public.platform_admins, public.background_jobs, public.rate_limits from authenticated;
revoke insert, update, delete on public.audit_logs, public.activity_logs from authenticated;
revoke insert, delete on public.users, public.businesses, public.business_settings from authenticated;
revoke insert on public.business_members from authenticated;

-- Column-level update grants: users may not change identity or system columns.
revoke update on public.users from authenticated;
grant update (full_name, avatar_url, dashboard_view, last_business_id) on public.users to authenticated;
revoke update on public.businesses from authenticated;
grant update (name, website_url, industry, description, sells, ai_goals) on public.businesses to authenticated;
revoke update on public.business_members from authenticated;
grant update (role, permissions) on public.business_members to authenticated;
revoke update on public.business_settings from authenticated;
grant update (onboarding_step, onboarding_completed_at, shopify_step_skipped, timezone, support_email,
              escalation_email, conversation_retention_days)
  on public.business_settings to authenticated;
revoke update on public.business_invitations from authenticated;
grant update (revoked_at) on public.business_invitations to authenticated;

-- Functions: only what the app needs, only to the roles that need it.
revoke execute on function public.claim_background_jobs(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.fail_background_job(uuid, text) from public, anon, authenticated;
revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.create_business(text, text, text, text) from public, anon;
revoke execute on function public.accept_business_invitation(text) from public, anon;
revoke execute on function public.list_my_sessions() from public, anon;
revoke execute on function public.revoke_my_session(uuid) from public, anon;
revoke execute on function public.handle_auth_user_change() from public, anon, authenticated;
grant execute on function public.create_business(text, text, text, text) to authenticated;
grant execute on function public.accept_business_invitation(text) to authenticated;
grant execute on function public.list_my_sessions() to authenticated;
grant execute on function public.revoke_my_session(uuid) to authenticated;
grant execute on function public.claim_background_jobs(text, integer, integer) to service_role;
grant execute on function public.fail_background_job(uuid, text) to service_role;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
