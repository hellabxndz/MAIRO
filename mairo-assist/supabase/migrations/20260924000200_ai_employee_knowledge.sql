-- Mairo Assist — AI employee configuration, versions, and knowledge base.

-- ---------------------------------------------------------------------------
-- ai_employees: one AI employee per business (for now).
--   draft_config     — what the owner is editing (validated by the app).
--   published_version_id — what customers actually talk to.
-- An employee can only be 'active' once a version is published AND it has
-- been tested in preview: an untested assistant is never switched on.
-- ---------------------------------------------------------------------------
create table public.ai_employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  avatar_url text check (char_length(avatar_url) <= 2048),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  draft_config jsonb not null default '{}'::jsonb check (jsonb_typeof(draft_config) = 'object'),
  published_version_id uuid,
  tested_at timestamptz,
  activated_at timestamptz,
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_employees_active_requires_tested_publish
    check (status <> 'active' or (published_version_id is not null and tested_at is not null))
);

create trigger ai_employees_set_updated_at before update on public.ai_employees
  for each row execute function public.set_updated_at();

create table public.ai_employee_versions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  ai_employee_id uuid not null references public.ai_employees (id) on delete cascade,
  version integer not null check (version > 0),
  name text not null,
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  note text check (char_length(note) <= 280),
  created_by uuid references public.users (id) on delete set null,
  published_at timestamptz not null default now(),
  unique (ai_employee_id, version)
);

create index ai_employee_versions_business_idx on public.ai_employee_versions (business_id, published_at desc);

alter table public.ai_employees
  add constraint ai_employees_published_version_fk foreign key (published_version_id)
  references public.ai_employee_versions (id) on delete set null;

-- The published version must belong to the same employee.
create or replace function public.check_published_version_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.published_version_id is not null and not exists (
    select 1 from public.ai_employee_versions v
    where v.id = new.published_version_id and v.ai_employee_id = new.id
  ) then
    raise exception 'Published version does not belong to this AI employee' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger ai_employees_check_version before insert or update of published_version_id on public.ai_employees
  for each row execute function public.check_published_version_owner();

-- ---------------------------------------------------------------------------
-- Knowledge base. Documents are tenant-isolated; chunks are the indexed text
-- the AI retrieves from (full-text search now; vector embeddings are added
-- with the AI conversation phase).
-- ---------------------------------------------------------------------------
create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  category text not null check (category in (
    'shipping_policy', 'refund_policy', 'return_policy', 'product_info', 'sizing_guide', 'faq',
    'company_background', 'business_hours', 'contact_info', 'support_instructions', 'other'
  )),
  source_type text not null check (source_type in ('manual', 'upload', 'shopify_policy')),
  storage_path text check (char_length(storage_path) <= 1024),
  mime_type text check (char_length(mime_type) <= 120),
  size_bytes integer check (size_bytes between 0 and 10485760),
  content text check (char_length(content) <= 200000),
  status text not null default 'ready' check (status in ('pending', 'processing', 'ready', 'failed')),
  error text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index knowledge_documents_business_idx on public.knowledge_documents (business_id, category);

create trigger knowledge_documents_set_updated_at before update on public.knowledge_documents
  for each row execute function public.set_updated_at();

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  document_id uuid not null references public.knowledge_documents (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  token_count integer,
  tsv tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index knowledge_chunks_business_idx on public.knowledge_chunks (business_id);
create index knowledge_chunks_tsv_idx on public.knowledge_chunks using gin (tsv);

-- Chunks must belong to the same business as their document.
create or replace function public.check_same_business_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.knowledge_documents d where d.id = new.document_id and d.business_id = new.business_id
  ) then
    raise exception 'Chunk business does not match document business' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger knowledge_chunks_same_business before insert or update on public.knowledge_chunks
  for each row execute function public.check_same_business_document();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.ai_employees enable row level security;
alter table public.ai_employee_versions enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;

create policy ai_employees_select_member on public.ai_employees for select to authenticated
  using (public.is_business_member(business_id));
create policy ai_employees_insert_manager on public.ai_employees for insert to authenticated
  with check (public.has_business_role(business_id, array['owner', 'admin']));
create policy ai_employees_update_manager on public.ai_employees for update to authenticated
  using (public.has_business_role(business_id, array['owner', 'admin']))
  with check (public.has_business_role(business_id, array['owner', 'admin']));

create policy ai_versions_select_manager on public.ai_employee_versions for select to authenticated
  using (public.has_business_role(business_id, array['owner', 'admin']));

create policy knowledge_documents_select_member on public.knowledge_documents for select to authenticated
  using (public.is_business_member(business_id));
create policy knowledge_documents_insert_manager on public.knowledge_documents for insert to authenticated
  with check (public.has_business_role(business_id, array['owner', 'admin'])
              and created_by = (select auth.uid()) and source_type = 'manual');
create policy knowledge_documents_update_manager on public.knowledge_documents for update to authenticated
  using (public.has_business_role(business_id, array['owner', 'admin']))
  with check (public.has_business_role(business_id, array['owner', 'admin']));
create policy knowledge_documents_delete_manager on public.knowledge_documents for delete to authenticated
  using (public.has_business_role(business_id, array['owner', 'admin']));

create policy knowledge_chunks_select_member on public.knowledge_chunks for select to authenticated
  using (public.is_business_member(business_id));

revoke all on public.ai_employees, public.ai_employee_versions, public.knowledge_documents,
  public.knowledge_chunks from anon;
revoke delete on public.ai_employees from authenticated;
revoke insert, update, delete on public.ai_employee_versions, public.knowledge_chunks from authenticated;

-- Status, testing and publishing move only through the server (which checks
-- the tested/published invariants and writes the audit trail).
revoke update on public.ai_employees from authenticated;
grant update (name, avatar_url, draft_config) on public.ai_employees to authenticated;
revoke update on public.knowledge_documents from authenticated;
grant update (title, category, content) on public.knowledge_documents to authenticated;
revoke insert on public.ai_employees from authenticated;
grant insert (business_id, name, avatar_url, draft_config) on public.ai_employees to authenticated;
revoke insert on public.knowledge_documents from authenticated;
grant insert (business_id, title, category, source_type, content, created_by) on public.knowledge_documents to authenticated;
