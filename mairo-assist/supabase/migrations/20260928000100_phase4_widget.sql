-- Mairo Assist — Phase 4: storefront chat widget and order verification.

-- The widget's script tag on the merchant's store (installed from the dashboard).
alter table public.shopify_connections
  add column if not exists script_tag_gid text,
  add column if not exists widget_installed_at timestamptz;

-- Widget conversations are tied to a per-browser secret: conversations.visitor_id
-- holds its SHA-256 hash, so only that browser can read or continue the chat.
create index if not exists conversations_visitor_idx on public.conversations (business_id, visitor_id)
  where visitor_id is not null;

-- After a customer proves they own an order (one-time code to the order's
-- email), the conversation may see orders for that email until verified_until.
alter table public.conversations add column if not exists verified_email_hash text;

alter table public.order_verifications
  add column if not exists order_id uuid references public.orders (id) on delete cascade,
  add column if not exists email_hash text;
