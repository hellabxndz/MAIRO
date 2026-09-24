-- Mairo Assist — Phase 2: AI conversations, preview, knowledge retrieval,
-- retention.

-- Preview (owner test) conversations belong to the team member who ran them.
alter table public.conversations
  add column preview_user_id uuid references public.users (id) on delete cascade,
  add constraint conversations_preview_owner check (channel <> 'preview' or preview_user_id is not null);

create index conversations_preview_idx on public.conversations (business_id, preview_user_id) where channel = 'preview';

-- Keep message_count / last_message_at in step with the messages table.
create or replace function public.bump_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set message_count = message_count + 1,
      last_message_at = new.created_at,
      status = case when status = 'new' and new.sender_type = 'ai' then 'ai_handling' else status end
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger conversation_messages_bump after insert on public.conversation_messages
  for each row execute function public.bump_conversation_on_message();

-- Which tools ran for an AI message (names only; details live in ai_tool_executions).
alter table public.conversation_messages
  add column tool_names text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Knowledge retrieval. Matches ANY meaningful word of the query (a customer
-- question rarely contains every word of the policy), ranked by relevance.
-- Always scoped to one business; callable by the server only.
-- ---------------------------------------------------------------------------
create or replace function public.search_knowledge_chunks(p_business_id uuid, p_query text, p_limit integer default 5)
returns table (
  chunk_id uuid,
  document_id uuid,
  title text,
  category text,
  content text,
  rank real
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query tsquery;
begin
  select to_tsquery('english', string_agg(lexeme, ' | '))
  into v_query
  from unnest(tsvector_to_array(to_tsvector('english', left(coalesce(p_query, ''), 500)))) as lexeme;

  if v_query is null then
    return;
  end if;

  return query
  select c.id, d.id, d.title, d.category, c.content, ts_rank_cd(c.tsv, v_query) as rank
  from public.knowledge_chunks c
  join public.knowledge_documents d on d.id = c.document_id
  where c.business_id = p_business_id
    and d.business_id = p_business_id
    and d.status = 'ready'
    and c.tsv @@ v_query
  order by rank desc, d.updated_at desc
  limit greatest(1, least(p_limit, 10));
end;
$$;

revoke execute on function public.search_knowledge_chunks(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.search_knowledge_chunks(uuid, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Retention: delete conversations whose last activity is older than the
-- business's configured retention period. Preview chats are kept 7 days.
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_conversations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.conversations c
  using public.business_settings s
  where s.business_id = c.business_id
    and coalesce(c.last_message_at, c.created_at) <
        now() - make_interval(days => case when c.channel = 'preview' then 7 else s.conversation_retention_days end);
  get diagnostics v_count = row_count;
  delete from public.rate_limits where window_start < now() - interval '2 days';
  return v_count;
end;
$$;

revoke execute on function public.purge_expired_conversations() from public, anon, authenticated;
grant execute on function public.purge_expired_conversations() to service_role;

-- Preview conversations are private to the person testing.
drop policy conversations_select_member on public.conversations;
create policy conversations_select_member on public.conversations for select to authenticated
  using (public.is_business_member(business_id) and (channel <> 'preview' or preview_user_id = (select auth.uid())));

-- When the owner last changed the draft (name or configuration). Lets the UI
-- tell whether the latest draft has been tried in the preview.
alter table public.ai_employees add column draft_saved_at timestamptz not null default now();

create or replace function public.touch_ai_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.draft_config is distinct from old.draft_config or new.name is distinct from old.name then
    new.draft_saved_at := now();
  end if;
  return new;
end;
$$;

create trigger ai_employees_touch_draft before update on public.ai_employees
  for each row execute function public.touch_ai_draft();
