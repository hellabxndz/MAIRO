-- Phase 3: Shopify connection rules and store data isolation.
-- Uses fixtures from the earlier files (business A "Acme Denim", "Other Shop").

select id as biz_a from public.businesses where name = 'Acme Denim' \gset
select id as biz_o from public.businesses where name = 'Other Shop' \gset

set role service_role;
-- Retire the pending connection created by the tenant-isolation fixtures.
update public.shopify_connections set status = 'disconnected' where business_id = :'biz_a';

-- "Connected" only after validation; one live connection per business and per shop.
select tst.fails(format($$insert into public.shopify_connections (business_id, shop_domain, status) values (%L, 'acme.myshopify.com', 'active')$$, :'biz_a'),
  'a connection cannot be active without validation');
insert into public.shopify_connections (id, business_id, shop_domain, status, validated_at)
  values ('70000000-0000-0000-0000-000000000001', :'biz_a', 'acme.myshopify.com', 'active', now());
select tst.fails(format($$insert into public.shopify_connections (business_id, shop_domain) values (%L, 'acme.myshopify.com')$$, :'biz_o'),
  'a shop cannot be live for two businesses');
select tst.fails(format($$insert into public.shopify_connections (business_id, shop_domain) values (%L, 'acme-two.myshopify.com')$$, :'biz_a'),
  'a business has at most one live store');
select tst.fails(format($$insert into public.shopify_connections (business_id, shop_domain) values (%L, 'evil.com')$$, :'biz_o'),
  'only myshopify.com domains are stored');

-- OAuth state return paths must stay on this site.
select tst.fails(format($$insert into public.shopify_oauth_states (state_hash, business_id, user_id, shop_domain, expires_at, return_to)
  values ('h1', %L, '00000000-0000-0000-0000-00000000000a', 'acme.myshopify.com', now(), '//evil.com')$$, :'biz_a'),
  'an OAuth return path cannot leave the site');

-- A sync can't be queued twice for the same store.
insert into public.background_jobs (business_id, type, payload) values (:'biz_a', 'shopify.sync_products', '{"connection_id":"70000000-0000-0000-0000-000000000001"}');
select tst.fails(format($$insert into public.background_jobs (business_id, type, payload) values (%L, 'shopify.sync_products', '{"connection_id":"70000000-0000-0000-0000-000000000001"}')$$, :'biz_a'),
  'a second pending sync for the same store is refused');
delete from public.background_jobs where type = 'shopify.sync_products';

insert into public.products (business_id, shopify_connection_id, shopify_gid, title)
  values (:'biz_a', '70000000-0000-0000-0000-000000000001', 'gid://shopify/Product/1', 'Acme Jacket');
insert into public.shopify_credentials (connection_id, business_id, access_token_enc)
  values ('70000000-0000-0000-0000-000000000001', :'biz_a', 'v1:ciphertext');
reset role;

-- Members see their own store's data; nobody reads credentials; nobody writes store data.
set role authenticated;
select tst.claims('00000000-0000-0000-0000-00000000000a', 'owner.a@example.com');
select tst.ok((select count(*) from public.products) = 1, 'a member sees their store''s products');
select tst.ok((select count(*) from public.shopify_connections where status = 'active') = 1, 'a member sees their store connection');
select tst.fails($$select * from public.shopify_credentials$$, 'members cannot read store credentials');
select tst.fails($$select * from public.shopify_oauth_states$$, 'members cannot read OAuth states');
select tst.fails($$update public.products set title = 'x'$$, 'members cannot edit synced products');
select tst.fails($$update public.shopify_connections set status = 'active'$$, 'members cannot change a connection directly');

select tst.claims('00000000-0000-0000-0000-0000000000e1', 'other.owner@example.com');
select tst.ok((select count(*) from public.products) = 0, 'another business sees none of these products');
select tst.ok((select count(*) from public.shopify_connections) = 0, 'another business sees no connection');
reset role;
