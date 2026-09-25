-- Free plan: automatic subscription, credits, and billing isolation.

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'free.owner@example.com');
set role authenticated;
select tst.claims('00000000-0000-0000-0000-0000000000f1', 'free.owner@example.com');
select public.create_business('Free Shop') as biz_f \gset
reset role;

select tst.ok((select count(*) = 1 and bool_and(plan_key = 'free' and status = 'active' and provider = 'none' and price_cents = 0)
  from public.subscriptions where business_id = :'biz_f'), 'a new business starts on exactly one Free subscription');

set role service_role;
select tst.fails(format($$insert into public.subscriptions (business_id, plan_key, status, provider) values (%L, 'free', 'active', 'none')$$, :'biz_f'),
  'a business cannot get a second subscription');
select tst.fails(format($$update public.subscriptions set provider = 'stripe' where business_id = %L$$, :'biz_f'),
  'a Free subscription is never tied to a payment provider');
select tst.fails(format($$update public.subscriptions set plan_key = 'pro' where business_id = %L$$, :'biz_f'),
  'a paid plan cannot be set without a provider');

select public.record_ai_response(:'biz_f', '2026-09-01');
select public.record_ai_response(:'biz_f', '2026-09-01');
select tst.ok((select ai_responses = 2 from public.usage_counters where business_id = :'biz_f' and period_start = '2026-09-01'),
  'each AI response uses one credit');
reset role;

set role authenticated;
select tst.claims('00000000-0000-0000-0000-0000000000f1', 'free.owner@example.com');
select tst.ok(public.business_credit_usage(:'biz_f', '2026-09-01') = 2, 'the owner sees their credit usage');
select tst.ok(public.business_credit_usage(:'biz_f', '2026-10-01') = 0, 'a new month starts at zero');
select tst.fails(format($$select public.record_ai_response(%L, '2026-09-01')$$, :'biz_f'), 'members cannot spend or add credits directly');
select tst.fails($$select * from public.billing_checkouts$$, 'checkout records are server-only');
select tst.fails(format($$update public.subscriptions set plan_key = 'pro' where business_id = %L$$, :'biz_f'), 'members cannot change their plan directly');

select tst.claims('00000000-0000-0000-0000-00000000000a', 'owner.a@example.com');
select tst.ok(public.business_credit_usage(:'biz_f', '2026-09-01') is null, 'another business cannot read these credits');
reset role;
