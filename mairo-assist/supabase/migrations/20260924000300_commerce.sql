-- Mairo Assist — Shopify connection, catalog, customers and orders.
--
-- All commerce rows are written by the server (service role) from Shopify
-- data. Dashboard users only read them through RLS. Access tokens live in a
-- separate table no browser-facing role can read, encrypted by the app
-- (AES-256-GCM, key in ENCRYPTION_KEY) before they reach the database.

create table public.shopify_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  shop_domain text not null check (shop_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'),
  shop_name text,
  shopify_shop_gid text,
  currency text check (char_length(currency) = 3),
  scopes text[] not null default '{}',
  api_version text,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'reauth_required', 'disconnected', 'uninstalled')),
  installed_at timestamptz,
  validated_at timestamptz,
  last_sync_at timestamptz,
  last_sync_status text check (last_sync_status in ('running', 'succeeded', 'partial', 'failed')),
  last_error text,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- "Connected" is only ever shown after the token was validated against the API.
  constraint shopify_active_requires_validation check (status <> 'active' or validated_at is not null)
);

-- One live connection per business, and a shop can be live for only one business.
create unique index shopify_connections_one_live_per_business
  on public.shopify_connections (business_id) where status in ('pending', 'active', 'reauth_required');
create unique index shopify_connections_one_live_per_shop
  on public.shopify_connections (shop_domain) where status in ('pending', 'active', 'reauth_required');

create trigger shopify_connections_set_updated_at before update on public.shopify_connections
  for each row execute function public.set_updated_at();

create table public.shopify_credentials (
  connection_id uuid primary key references public.shopify_connections (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  access_token_enc text not null,
  access_token_expires_at timestamptz,
  refresh_token_enc text,
  refresh_token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger shopify_credentials_set_updated_at before update on public.shopify_credentials
  for each row execute function public.set_updated_at();

-- Short-lived OAuth state (CSRF protection for the install/authorize redirect).
create table public.shopify_oauth_states (
  state_hash text primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  shop_domain text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
-- array_to_string is only STABLE; for text[] it is safe to treat as immutable,
-- which generated search columns require.
create or replace function public.tags_to_text(p_tags text[])
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$ select array_to_string(p_tags, ' ') $$;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  shopify_connection_id uuid references public.shopify_connections (id) on delete set null,
  shopify_gid text not null,
  title text not null,
  handle text,
  description text,
  product_type text,
  vendor text,
  tags text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'draft', 'archived', 'unlisted')),
  online_store_url text,
  featured_image_url text,
  images jsonb not null default '[]'::jsonb,
  options jsonb not null default '[]'::jsonb,
  price_min numeric(12, 2),
  price_max numeric(12, 2),
  currency text,
  total_inventory integer,
  tracks_inventory boolean,
  shopify_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz,
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(product_type, '') || ' ' || coalesce(vendor, '') || ' ' ||
                                     public.tags_to_text(tags)), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, shopify_gid)
);

create index products_business_idx on public.products (business_id) where deleted_at is null;
create index products_search_idx on public.products using gin (search);

create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  shopify_gid text not null,
  title text not null,
  sku text,
  price numeric(12, 2),
  compare_at_price numeric(12, 2),
  selected_options jsonb not null default '[]'::jsonb,
  available_for_sale boolean,
  -- NULL means "not known": the AI must not claim stock it cannot verify.
  inventory_quantity integer,
  inventory_tracked boolean,
  image_url text,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, shopify_gid)
);

create index product_variants_product_idx on public.product_variants (product_id);

create trigger product_variants_set_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Customers — only what the product needs (no phone, no addresses).
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  shopify_gid text,
  email text check (email is null or email = lower(email)),
  name text,
  orders_count integer,
  total_spent numeric(12, 2),
  currency text,
  lead_status text not null default 'none'
    check (lead_status in ('none', 'new', 'contacted', 'qualified', 'converted', 'lost')),
  support_notes text check (char_length(support_notes) <= 10000),
  preferred_channel text check (preferred_channel in ('email', 'sms', 'chat')),
  marketing_opted_out_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz,
  redacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index customers_business_gid_idx on public.customers (business_id, shopify_gid) where shopify_gid is not null;
create unique index customers_business_email_idx on public.customers (business_id, email) where email is not null;

create trigger customers_set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  shopify_gid text not null,
  customer_id uuid references public.customers (id) on delete set null,
  name text not null,                       -- e.g. "#1001"
  email text check (email is null or email = lower(email)), -- used only for verification
  processed_at timestamptz,
  financial_status text,
  fulfillment_status text,
  display_status text,
  cancelled_at timestamptz,
  cancel_reason text,
  currency text,
  total_price numeric(12, 2),
  subtotal_price numeric(12, 2),
  status_page_url text,
  shopify_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, shopify_gid)
);

create index orders_business_name_idx on public.orders (business_id, name);
create index orders_business_processed_idx on public.orders (business_id, processed_at desc);
create index orders_customer_idx on public.orders (customer_id);

create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  shopify_gid text not null,
  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  title text not null,
  variant_title text,
  sku text,
  quantity integer not null check (quantity >= 0),
  unit_price numeric(12, 2),
  image_url text,
  created_at timestamptz not null default now(),
  unique (business_id, shopify_gid)
);

create index order_items_order_idx on public.order_items (order_id);

create table public.fulfillments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  shopify_gid text not null,
  status text,
  display_status text,
  tracking_company text,
  tracking_number text,
  tracking_url text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  estimated_delivery_at timestamptz,
  shopify_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, shopify_gid)
);

create index fulfillments_order_idx on public.fulfillments (order_id);

create trigger fulfillments_set_updated_at before update on public.fulfillments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Inbound webhooks (Shopify, Stripe). Deduplicated on the provider's
-- delivery/event ID so a duplicate delivery is recorded once and processed once.
-- ---------------------------------------------------------------------------
create table public.integration_webhooks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,
  provider text not null check (provider in ('shopify', 'stripe')),
  topic text not null,
  external_id text not null,
  shop_domain text,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processing', 'processed', 'failed', 'ignored')),
  attempts integer not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, external_id)
);

create index integration_webhooks_status_idx on public.integration_webhooks (status, received_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.shopify_connections enable row level security;
alter table public.shopify_credentials enable row level security;
alter table public.shopify_oauth_states enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.fulfillments enable row level security;
alter table public.integration_webhooks enable row level security;

create policy shopify_connections_select_member on public.shopify_connections for select to authenticated
  using (public.is_business_member(business_id));
create policy products_select_member on public.products for select to authenticated
  using (public.is_business_member(business_id));
create policy product_variants_select_member on public.product_variants for select to authenticated
  using (public.is_business_member(business_id));
create policy customers_select_member on public.customers for select to authenticated
  using (public.is_business_member(business_id));
create policy customers_update_member on public.customers for update to authenticated
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy orders_select_member on public.orders for select to authenticated
  using (public.is_business_member(business_id));
create policy order_items_select_member on public.order_items for select to authenticated
  using (public.is_business_member(business_id));
create policy fulfillments_select_member on public.fulfillments for select to authenticated
  using (public.is_business_member(business_id));

revoke all on public.shopify_connections, public.shopify_credentials, public.shopify_oauth_states,
  public.products, public.product_variants, public.customers, public.orders, public.order_items,
  public.fulfillments, public.integration_webhooks
  from anon;
revoke all on public.shopify_credentials, public.shopify_oauth_states, public.integration_webhooks
  from authenticated;
revoke insert, update, delete on public.shopify_connections, public.products, public.product_variants,
  public.orders, public.order_items, public.fulfillments
  from authenticated;
revoke insert, delete on public.customers from authenticated;
revoke update on public.customers from authenticated;
grant update (lead_status, support_notes) on public.customers to authenticated;
