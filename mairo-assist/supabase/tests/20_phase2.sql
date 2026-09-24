-- Phase 2: message counters, preview privacy, knowledge search, retention.
-- Uses the tst helpers and fixtures created by 10_tenant_isolation.sql
-- (business A with owner A and admin C; business B was deleted).

select id as biz_a from public.businesses where name = 'Acme Denim' \gset

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'other.owner@example.com');
set role authenticated;
select tst.claims('00000000-0000-0000-0000-0000000000e1', 'other.owner@example.com');
select public.create_business('Other Shop') as biz_o \gset
reset role;

set role service_role;

-- Message counters and status move with real messages.
insert into public.conversations (id, business_id, status) values ('40000000-0000-0000-0000-000000000001', :'biz_a', 'new');
insert into public.conversation_messages (business_id, conversation_id, sender_type, content)
  values (:'biz_a', '40000000-0000-0000-0000-000000000001', 'customer', 'hi');
insert into public.conversation_messages (business_id, conversation_id, sender_type, content)
  values (:'biz_a', '40000000-0000-0000-0000-000000000001', 'ai', 'hello');
select tst.ok((select message_count = 2 and last_message_at is not null and status = 'ai_handling'
  from public.conversations where id = '40000000-0000-0000-0000-000000000001'), 'messages update count, last activity and status');

-- Preview conversations require an owner and are private to them.
select tst.fails(format($$insert into public.conversations (business_id, channel) values (%L, 'preview')$$, :'biz_a'),
  'a preview conversation must belong to a team member');
insert into public.conversations (id, business_id, channel, preview_user_id)
  values ('40000000-0000-0000-0000-000000000002', :'biz_a', 'preview', '00000000-0000-0000-0000-00000000000a');

-- Knowledge search is scoped to one business and matches any meaningful word.
insert into public.knowledge_documents (id, business_id, title, category, source_type, content)
values
  ('50000000-0000-0000-0000-000000000001', :'biz_a', 'Return policy', 'return_policy', 'manual', 'Returns are accepted within 30 days of delivery.'),
  ('50000000-0000-0000-0000-000000000002', :'biz_o', 'Other returns', 'return_policy', 'manual', 'Other shop returns: 90 days.');
insert into public.knowledge_chunks (business_id, document_id, chunk_index, content) values
  (:'biz_a', '50000000-0000-0000-0000-000000000001', 0, 'Returns are accepted within 30 days of delivery.'),
  (:'biz_o', '50000000-0000-0000-0000-000000000002', 0, 'Other shop returns: 90 days.');
select tst.fails(format($$insert into public.knowledge_chunks (business_id, document_id, chunk_index, content)
  values (%L, '50000000-0000-0000-0000-000000000001', 1, 'x')$$, :'biz_o'), 'a chunk cannot point at another business''s document');

select tst.ok((select count(*) from public.search_knowledge_chunks(:'biz_a', 'Can I return my jeans?', 5)) = 1,
  'knowledge search finds the matching policy');
select tst.ok((select bool_and(title = 'Return policy') from public.search_knowledge_chunks(:'biz_a', 'returns', 5)),
  'knowledge search never returns another business''s content');
select tst.ok((select count(*) from public.search_knowledge_chunks(:'biz_a', 'the and of', 5)) = 0,
  'a query with no meaningful words returns nothing');
reset role;

set role authenticated;
select tst.claims('00000000-0000-0000-0000-00000000000a', 'owner.a@example.com');
select tst.fails($$select * from public.search_knowledge_chunks('00000000-0000-0000-0000-000000000000', 'x', 1)$$,
  'signed-in users cannot call knowledge search directly');
select tst.ok((select count(*) from public.conversations where channel = 'preview') = 1, 'owner sees their own preview chat');
select tst.claims('00000000-0000-0000-0000-00000000000c', 'agent.c@example.com');
select tst.ok((select count(*) from public.conversations where channel = 'preview') = 0, 'teammates cannot see someone else''s preview chat');
select tst.ok((select count(*) from public.conversations where id = '40000000-0000-0000-0000-000000000001') = 1, 'teammates see live conversations');
select tst.fails($$select public.purge_expired_conversations()$$, 'signed-in users cannot run the retention job');
reset role;

-- Retention removes only conversations older than the business's setting.
update public.business_settings set conversation_retention_days = 30 where business_id = :'biz_a';
insert into public.conversations (id, business_id, last_message_at) values
  ('40000000-0000-0000-0000-000000000003', :'biz_a', now() - interval '31 days'),
  ('40000000-0000-0000-0000-000000000004', :'biz_a', now() - interval '29 days');
update public.conversations set last_message_at = now() - interval '8 days' where id = '40000000-0000-0000-0000-000000000002';
set role service_role;
select tst.ok(public.purge_expired_conversations() = 2, 'retention deletes the expired conversation and the stale preview');
select tst.ok((select count(*) from public.conversations where id in ('40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002')) = 0,
  'expired conversations are gone');
select tst.ok((select count(*) from public.conversations where id in ('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004')) = 2,
  'recent conversations are kept');
reset role;

-- draft_saved_at moves only when the draft changes.
set role service_role;
insert into public.ai_employees (id, business_id, name) values ('60000000-0000-0000-0000-000000000001', :'biz_o', 'Nova');
update public.ai_employees set draft_saved_at = now() - interval '1 hour' where id = '60000000-0000-0000-0000-000000000001';
update public.ai_employees set tested_at = now() where id = '60000000-0000-0000-0000-000000000001';
select tst.ok((select draft_saved_at < now() - interval '59 minutes' from public.ai_employees where id = '60000000-0000-0000-0000-000000000001'),
  'testing does not count as a draft change');
update public.ai_employees set draft_config = '{"personality":"luxury"}' where id = '60000000-0000-0000-0000-000000000001';
select tst.ok((select draft_saved_at >= now() - interval '1 second' from public.ai_employees where id = '60000000-0000-0000-0000-000000000001'),
  'editing the draft updates draft_saved_at');
reset role;
