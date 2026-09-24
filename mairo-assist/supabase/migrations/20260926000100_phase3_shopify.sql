-- Mairo Assist — Phase 3: Shopify connection and sync.

-- Where to send the merchant after authorizing (e.g. back to onboarding).
alter table public.shopify_oauth_states
  add column return_to text check (return_to is null or (return_to like '/%' and return_to not like '//%'));

-- Inventory webhooks identify an inventory item, not a variant.
alter table public.product_variants add column inventory_item_gid text;
create index product_variants_inventory_item_idx on public.product_variants (business_id, inventory_item_gid)
  where inventory_item_gid is not null;

-- Every tracking number/link Shopify reports for a fulfillment (one shipment
-- can have several). tracking_* columns keep the first for quick display.
alter table public.fulfillments add column tracking jsonb not null default '[]'::jsonb
  check (jsonb_typeof(tracking) = 'array');

-- Connection bookkeeping.
alter table public.shopify_connections
  add column webhooks_registered_at timestamptz,
  add column customer_data_enabled boolean not null default false,
  add column products_synced integer,
  add column orders_synced integer;

-- A job for the same shop and purpose shouldn't queue twice.
create unique index background_jobs_one_pending_per_key
  on public.background_jobs (type, (payload ->> 'connection_id'))
  where status in ('queued', 'running') and type like 'shopify.sync_%';

-- Refresh tokens rotate on every use, so only one worker may refresh a
-- shop's token at a time; others wait for the new token instead.
alter table public.shopify_credentials add column refreshing_until timestamptz;
