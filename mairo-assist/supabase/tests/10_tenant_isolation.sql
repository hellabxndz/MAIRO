-- Tenant isolation, role permissions and integrity rules.
-- Every check raises (and aborts the run) on failure.

create schema tst;
grant usage on schema tst to anon, authenticated, service_role;

create function tst.ok(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'FAILED: %', p_message;
  end if;
  raise notice 'ok - %', p_message;
end;
$$;

-- Runs a statement that MUST fail; returns the error message.
create function tst.fails(p_sql text, p_message text) returns void language plpgsql as $$
declare
  v_failed boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    v_failed := true;
  end;
  perform tst.ok(v_failed, p_message);
end;
$$;

-- Runs a statement and returns how many rows it touched.
create function tst.rows(p_sql text) returns integer language plpgsql as $$
declare
  v_count integer;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on all functions in schema tst to anon, authenticated, service_role;

create function tst.claims(p_sub uuid, p_email text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_sub, 'email', p_email, 'role', 'authenticated')::text, false);
$$;
grant execute on function tst.claims(uuid, text) to anon, authenticated, service_role;

-- Fixture users -------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'Owner.A@example.com', '{"full_name":"Owner A"}'),
  ('00000000-0000-0000-0000-00000000000b', 'owner.b@example.com', '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'agent.c@example.com', '{}'),
  ('00000000-0000-0000-0000-00000000000d', 'mallory@example.com', '{}');

select tst.ok((select count(*) from public.users) = 4, 'auth trigger creates a profile per user');
select tst.ok((select email from public.users where id = '00000000-0000-0000-0000-00000000000a') = 'owner.a@example.com',
  'profile email is lower-cased');
select tst.ok((select full_name from public.users where id = '00000000-0000-0000-0000-00000000000a') = 'Owner A',
  'profile picks up full_name from signup metadata');

-- Owners create their businesses ---------------------------------------------
set role authenticated;
select tst.claims('00000000-0000-0000-0000-00000000000a', 'owner.a@example.com');
select public.create_business('Acme Denim', 'https://acme.example', 'Apparel', 'Jeans') as biz_a \gset
select tst.claims('00000000-0000-0000-0000-00000000000b', 'owner.b@example.com');
select public.create_business('Acme Denim', null, null, null) as biz_b \gset
reset role;

select tst.ok(:'biz_a'::uuid <> :'biz_b'::uuid, 'two businesses created');
select tst.ok((select count(distinct slug) from public.businesses) = 2, 'duplicate names get unique slugs');
select tst.ok((select role from public.business_members where business_id = :'biz_a' and user_id = '00000000-0000-0000-0000-00000000000a') = 'owner',
  'creator becomes owner');
select tst.ok((select onboarding_step from public.business_settings where business_id = :'biz_a') = 2,
  'settings row created, onboarding advanced past step 1');

-- Service role seeds commerce data for business B -----------------------------
set role service_role;
insert into public.products (business_id, shopify_gid, title) values (:'biz_b', 'gid://shopify/Product/1', 'B secret jeans');
insert into public.customers (business_id, email, name) values (:'biz_b', 'buyer@example.com', 'Buyer');
insert into public.conversations (business_id, status) values (:'biz_a', 'new'), (:'biz_b', 'new');
update public.subscriptions set plan_key = 'growth', provider = 'manual' where business_id = :'biz_a';
insert into public.shopify_connections (id, business_id, shop_domain, status)
  values ('10000000-0000-0000-0000-000000000001', :'biz_a', 'acme.myshopify.com', 'pending');
insert into public.shopify_credentials (connection_id, business_id, access_token_enc)
  values ('10000000-0000-0000-0000-000000000001', :'biz_a', 'v1:ciphertext');
reset role;

select encode(extensions.digest('tok-c', 'sha256'), 'hex') as tok_c_hash \gset

-- Isolation: A sees only A -----------------------------------------------------
set role authenticated;
select tst.claims('00000000-0000-0000-0000-00000000000a', 'owner.a@example.com');
select tst.ok((select count(*) from public.businesses) = 1, 'owner A sees exactly one business');
select tst.ok((select id from public.businesses) = :'biz_a', 'owner A sees only business A');
select tst.ok((select count(*) from public.products) = 0, 'owner A cannot see business B products');
select tst.ok((select count(*) from public.customers) = 0, 'owner A cannot see business B customers');
select tst.ok((select count(*) from public.conversations) = 1, 'owner A sees only own conversations');
select tst.ok((select count(*) from public.business_settings where business_id = :'biz_b') = 0, 'owner A cannot read B settings');
select tst.ok(tst.rows(format('update public.businesses set name = %L where id = %L', 'pwned', :'biz_b')) = 0,
  'owner A cannot rename business B');
select tst.fails(format('insert into public.business_members (business_id, user_id, role) values (%L, %L, %L)',
  :'biz_b', '00000000-0000-0000-0000-00000000000a', 'owner'), 'owner A cannot add itself to business B');
select tst.fails('select * from public.shopify_credentials', 'credentials are unreadable by signed-in users');
select tst.fails('select * from public.shopify_oauth_states', 'oauth states are unreadable by signed-in users');
select tst.fails('select * from public.background_jobs', 'job queue is unreadable by signed-in users');
select tst.fails($$select public.claim_background_jobs('w')$$, 'signed-in users cannot claim jobs');
select tst.fails($$select public.rate_limit_hit('k', 1, 60)$$, 'signed-in users cannot touch rate limits');
select tst.fails(format('insert into public.audit_logs (business_id, actor_type, action) values (%L, %L, %L)',
  :'biz_a', 'user', 'forged'), 'audit log cannot be forged by users');
select tst.fails($$update public.users set email = 'x@example.com'$$, 'users cannot change their email column directly');
select tst.ok(tst.rows($$update public.users set dashboard_view = 'advanced' where id = auth.uid()$$) = 1,
  'users can change their own view preference');
select tst.ok(tst.rows($$update public.users set full_name = 'Hacked' where id = '00000000-0000-0000-0000-00000000000b'$$) = 0,
  'users cannot edit other users');
select tst.fails(format('update public.businesses set status = %L where id = %L', 'active', :'biz_a'),
  'owners cannot change system status columns');
select tst.ok((select count(*) from public.shopify_connections) = 1, 'owner sees own connection metadata');

-- Owner A invites C as support agent (token "tok-c") and D's token is misused.
insert into public.business_invitations (business_id, email, role, token_hash, invited_by, expires_at)
values (:'biz_a', 'agent.c@example.com', 'support_agent', :'tok_c_hash',
        '00000000-0000-0000-0000-00000000000a', now() + interval '7 days');

select tst.claims('00000000-0000-0000-0000-00000000000b', 'owner.b@example.com');
select tst.fails(format('insert into public.business_invitations (business_id, email, role, token_hash, invited_by, expires_at) values (%L, %L, %L, %L, %L, now())',
  :'biz_a', 'x@example.com', 'admin', 'h', '00000000-0000-0000-0000-00000000000b'), 'owner B cannot invite into business A');

select tst.claims('00000000-0000-0000-0000-00000000000d', 'mallory@example.com');
select tst.fails($$select public.accept_business_invitation('tok-c')$$, 'invitation cannot be accepted by a different email');
select tst.fails($$select public.accept_business_invitation('wrong')$$, 'unknown invitation token is rejected');

select tst.claims('00000000-0000-0000-0000-00000000000c', 'agent.c@example.com');
select tst.ok(public.accept_business_invitation('tok-c') = :'biz_a', 'invited agent accepts invitation');
select tst.fails($$select public.accept_business_invitation('tok-c')$$, 'invitation cannot be reused');

-- Support agent permissions ------------------------------------------------------
select tst.ok((select count(*) from public.businesses) = 1, 'agent sees business A');
select tst.ok((select count(*) from public.conversations) = 1, 'agent sees business A conversations');
select tst.ok((select count(*) from public.subscriptions) = 0, 'agent cannot see billing');
select tst.ok((select count(*) from public.audit_logs) = 0, 'agent cannot see audit logs');
select tst.ok((select count(*) from public.business_invitations) = 0, 'agent cannot see invitations');
select tst.ok(tst.rows(format('update public.businesses set name = %L where id = %L', 'agent edit', :'biz_a')) = 0,
  'agent cannot edit business settings');
select tst.ok(tst.rows(format($$update public.business_members set role = 'owner' where business_id = %L$$, :'biz_a')) = 0,
  'agent cannot promote itself');
select tst.ok((select count(*) from public.business_plan(:'biz_a')) = 1, 'agent can read plan key for feature gating');
select tst.ok((select count(*) from public.users) = 2, 'agent sees only teammates in user directory');
select tst.fails(format($$insert into public.ai_employees (business_id, name) values (%L, 'Nova')$$, :'biz_a'),
  'agent cannot create the AI employee');

-- Owner rules ----------------------------------------------------------------------
select tst.claims('00000000-0000-0000-0000-00000000000a', 'owner.a@example.com');
select tst.ok((select count(*) from public.subscriptions) = 1, 'owner sees billing');
select tst.ok((select count(*) from public.audit_logs) >= 2, 'owner sees audit logs');
select tst.fails(format($$delete from public.business_members where business_id = %L and user_id = auth.uid()$$, :'biz_a'),
  'last owner cannot leave');
select tst.fails(format($$update public.business_members set role = 'admin' where business_id = %L and user_id = auth.uid()$$, :'biz_a'),
  'last owner cannot demote itself');
select tst.ok(tst.rows(format($$update public.business_members set role = 'admin' where business_id = %L and user_id = '00000000-0000-0000-0000-00000000000c'$$, :'biz_a')) = 1,
  'owner can change a member role');
insert into public.ai_employees (business_id, name, draft_config) values (:'biz_a', 'Nova', '{"welcome_message":"Hi"}');
select tst.fails(format($$update public.ai_employees set status = 'active' where business_id = %L$$, :'biz_a'),
  'owner cannot flip status directly (server-only column)');

-- Anonymous visitors see nothing ------------------------------------------------------
reset role;
set role anon;
select set_config('request.jwt.claims', '', false);
select tst.fails('select count(*) from public.businesses', 'anon cannot read businesses');
select tst.fails('select count(*) from public.conversations', 'anon cannot read conversations');
select tst.fails($$select public.create_business('x')$$, 'anon cannot create businesses');
reset role;

-- Integrity rules enforced by the database ----------------------------------------------
set role service_role;
select tst.fails(format($$update public.ai_employees set status = 'active' where business_id = %L$$, :'biz_a'),
  'an untested, unpublished AI employee can never be active');
select tst.fails(format($$update public.shopify_connections set status = 'active' where business_id = %L$$, :'biz_a'),
  'a Shopify connection cannot be active before validation');
select tst.fails(format($$insert into public.shopify_connections (business_id, shop_domain) values (%L, 'acme.myshopify.com')$$, :'biz_b'),
  'a shop cannot be live for two businesses');
select tst.fails(format($$insert into public.shopify_connections (business_id, shop_domain) values (%L, 'https://evil.com')$$, :'biz_b'),
  'shop domain must be a myshopify.com domain');

insert into public.integration_webhooks (provider, topic, external_id, payload) values ('shopify', 'products/update', 'wh-1', '{}');
select tst.ok(tst.rows($$insert into public.integration_webhooks (provider, topic, external_id, payload)
  values ('shopify', 'products/update', 'wh-1', '{}') on conflict (provider, external_id) do nothing$$) = 0,
  'duplicate webhook delivery is recorded once');

insert into public.order_action_requests (id, business_id, action_type)
  values ('20000000-0000-0000-0000-000000000001', :'biz_a', 'refund');
select tst.fails($$update public.order_action_requests set status = 'approved' where id = '20000000-0000-0000-0000-000000000001'$$,
  'an approval must record who decided');
select tst.fails($$update public.order_action_requests set status = 'completed', decided_by = '00000000-0000-0000-0000-00000000000a'
  where id = '20000000-0000-0000-0000-000000000001'$$, 'an action cannot be completed without Shopify confirmation');

select tst.fails(format($$insert into public.conversation_messages (business_id, conversation_id, sender_type, content)
  select %L, id, 'customer', 'hi' from public.conversations where business_id = %L$$, :'biz_a', :'biz_b'),
  'a message cannot be attached to another business''s conversation');
select tst.fails(format($$update public.audit_logs set action = 'x' where business_id = %L$$, :'biz_a'),
  'audit logs are append-only');

-- Job queue: claim, fail with backoff, dead-letter.
insert into public.background_jobs (id, type, max_attempts) values ('30000000-0000-0000-0000-000000000001', 'test', 2);
select tst.ok((select count(*) from public.claim_background_jobs('w1', 5)) = 1, 'worker claims a queued job');
select tst.ok((select count(*) from public.claim_background_jobs('w2', 5)) = 0, 'a claimed job is not claimed twice');
select public.fail_background_job('30000000-0000-0000-0000-000000000001', 'boom');
select tst.ok((select status = 'queued' and run_at > now() from public.background_jobs where id = '30000000-0000-0000-0000-000000000001'),
  'failed job is re-queued with backoff');
update public.background_jobs set run_at = now() - interval '1 second' where id = '30000000-0000-0000-0000-000000000001';
select count(*) from public.claim_background_jobs('w1', 5) \gset ignored_
select public.fail_background_job('30000000-0000-0000-0000-000000000001', 'boom again');
select tst.ok((select status from public.background_jobs where id = '30000000-0000-0000-0000-000000000001') = 'dead',
  'job is dead-lettered after max attempts');

select tst.ok(public.rate_limit_hit('t', 2, 60) and public.rate_limit_hit('t', 2, 60) and not public.rate_limit_hit('t', 2, 60),
  'rate limiter allows the limit and blocks the next hit');

select public.record_ai_usage(:'biz_a', null, 'chat_completion', 'test-model', 100, 0, 50, 0.001, date '2026-09-01');
select public.record_ai_usage(:'biz_a', null, 'chat_completion', 'test-model', 10, 0, 5, 0.0001, date '2026-09-01');
select tst.ok((select model_requests = 2 and input_tokens = 110 and output_tokens = 55 from public.usage_counters
  where business_id = :'biz_a'), 'usage rolls up into the period counter');
reset role;

-- Deleting a business removes its data (including audit rows) ------------------------------
delete from public.businesses where id = :'biz_b';
select tst.ok((select count(*) from public.products where business_id = :'biz_b') = 0, 'business deletion cascades to catalog');
select tst.ok((select count(*) from public.business_members where business_id = :'biz_b') = 0, 'business deletion removes members');
select tst.ok((select count(*) from public.audit_logs where business_id = :'biz_b') = 0, 'business deletion removes its audit rows');
