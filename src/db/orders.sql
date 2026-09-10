-- Diners send an order from their phone; the pass accepts it and the kitchen cooks. Run in the
-- same project as schema.sql, after it and after service_requests.sql, menu_variants.sql and
-- menu_addons.sql -- place_order() reads price_variants and add_ons, so those two are hard
-- prerequisites rather than a suggested order.
--
-- The tier above service requests: ordering without a working "call the waiter" is not a product
-- anyone sells, so routes/public.js requires BOTH flags. Two columns rather than one `tier` enum
-- because that is how the ladder is actually shaped -- a restaurant switches ordering off for a
-- busy Saturday without losing waiter calls, and an enum would make that a migration.
--
-- No payment anywhere in here. The order reaches the kitchen; the bill is settled the way it
-- always was, through the bill request and a card machine. This product sits beside a POS, not in
-- its fight, and the moment money moves the whole compliance surface changes.

alter table restaurant.restaurants
  -- Off until an owner is on the tier. dinerPage.js only renders the cart when this is true, and
  -- routes/public.js re-checks it on every POST -- same reasoning as service_requests_enabled: the
  -- menu is cached 60s at a shared edge, so a phone can be holding a page whose cart outlives the
  -- toggle. The client check is a courtesy; the server check is the rule.
  add column if not exists ordering_enabled boolean not null default false;

create table if not exists restaurant.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurant.restaurants(id) on delete cascade,
  -- Same free text as service_requests.table_label, same reasoning, same sanitiser. A wrong number
  -- here costs a comped meal rather than a wasted walk, which is why the diner confirms it back in
  -- large type before Send and it prints on the accept card at the pass.
  table_label text not null,
  -- pending: waiting for a human. accepted: the kitchen has it. done: cleared off the display.
  -- Three states, not six. "Preparing" and "ready" belong to a kitchen display system; adding them
  -- here buys taps that staff stop doing by Friday. Splitting `accepted` later needs no migration
  -- of meaning, which is the point of stopping here.
  status text not null default 'pending' check (status in ('pending', 'accepted', 'done')),
  accepted_at timestamptz,
  accepted_by uuid references restaurant.staff(user_id) on delete set null,
  done_at timestamptz,
  -- Server-computed at insert from menu_items, never sent by the phone. Stored rather than summed
  -- from order_items on read because it is the number the restaurant argues with a diner about --
  -- it must be what was agreed at Send, not what a later menu edit implies.
  total_cents int not null,
  -- COMPLIANCE.md 5: every diner submission stores a salted hash and a timestamp, detection only.
  ip_hash text,
  created_at timestamptz not null default now()
);

create table if not exists restaurant.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references restaurant.orders(id) on delete cascade,
  -- Nullable, and set null rather than cascade: archiving a dish must never delete the record that
  -- someone ordered and was charged for it. Everything needed to read the line back is snapshotted
  -- below, so a null here still renders.
  menu_item_id uuid references restaurant.menu_items(id) on delete set null,
  -- The snapshot, and the whole reason variants stayed jsonb (see menu_variants.sql, which defers
  -- exactly this decision to exactly this moment). An order line must say what was ordered at the
  -- price agreed then. Pointing at a live variant means the owner editing the menu at 20:05
  -- silently rewrites a bill printed at 19:40. Copy the values in; the order becomes immutable by
  -- construction rather than by discipline.
  name_snapshot text not null,
  variant_label text,
  -- [{"label": "Extra cheese", "price_cents": 1000}, ...] -- same shape menu_items.add_ons uses,
  -- copied, so one renderer reads both.
  add_ons jsonb not null default '[]'::jsonb,
  -- unit_cents already includes the variant and the add-ons: it is what one of this line costs.
  unit_cents int not null,
  qty int not null check (qty between 1 and 20),
  line_cents int not null,
  position int not null default 0
);

create index if not exists order_items_order_idx on restaurant.order_items (order_id, position);

-- THE double-send guard. A phone that loses its response and retries, or a diner who taps Send
-- twice, must not put two of the same order on the pass.
--
-- A partial unique index rather than a check-then-insert, for the same reason service_requests has
-- one: the API runs as Vercel serverless functions, so two taps a moment apart land in two
-- concurrent invocations with no shared memory, and a SELECT-then-INSERT has a real race window.
-- The database is the single writer that decides whether this table already has an order in
-- flight. The disabled Send button on the phone is the polite version of this rule, not the rule.
--
-- Scoped to pending only: once staff accept, the table is free to order a second round, which is
-- the behaviour a restaurant actually wants.
create unique index if not exists orders_pending_idx
  on restaurant.orders (restaurant_id, lower(table_label))
  where status = 'pending';

-- The display polls restaurant_id + status, newest first.
create index if not exists orders_live_idx
  on restaurant.orders (restaurant_id, status, created_at desc);

-- Order and lines must land together or not at all, and the Supabase client cannot span two tables
-- in one transaction -- two calls with cleanup on failure leaves an order with no lines on the
-- pass the moment the second call fails. So the insert is a function: one statement from the
-- API's point of view, one transaction from Postgres's.
--
-- It also re-resolves every price from menu_items rather than trusting the phone, and re-checks
-- availability inside the same transaction that inserts -- the menu the diner is holding is up to
-- 60s stale, and "the ribs sold out while you were choosing" has to be caught here, not earlier.
-- A gone dish raises, which rolls the whole order back: never a partial order, because a line
-- dropped silently is someone not getting food they believe they ordered.
--
-- lines is [{"menu_item_id": uuid, "qty": int, "variant_label": text|null, "add_ons": [...]}]
create or replace function restaurant.place_order(
  p_restaurant_id uuid,
  p_table_label text,
  p_lines jsonb,
  p_ip_hash text
) returns uuid
language plpgsql
-- Deliberately NOT security definer. Only service_role can execute this (see the grants at the
-- bottom) and service_role already reaches every table it touches, so definer rights would buy
-- nothing and hand a privilege-escalation surface to anything that ever gets execute by mistake.
set search_path = restaurant, public
as $$
declare
  v_order_id uuid;
  v_line jsonb;
  v_item restaurant.menu_items%rowtype;
  v_unit int;
  v_add_on jsonb;
  v_extra int;
  v_total int := 0;
  v_line_cents int;
  v_qty int;
  v_pos int := 0;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty order' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_lines) > 40 then
    raise exception 'too many lines' using errcode = 'check_violation';
  end if;

  insert into restaurant.orders (restaurant_id, table_label, total_cents, ip_hash)
  values (p_restaurant_id, p_table_label, 0, p_ip_hash)
  returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_qty := coalesce((v_line->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 20 then
      raise exception 'bad quantity' using errcode = 'check_violation';
    end if;

    -- Joined through categories so a dish from another restaurant's menu cannot be ordered by id.
    select i.* into v_item
    from restaurant.menu_items i
    join restaurant.menu_categories c on c.id = i.category_id
    where i.id = (v_line->>'menu_item_id')::uuid
      and c.restaurant_id = p_restaurant_id
      and i.archived_at is null
      and i.available;

    if not found then
      -- Named, so the phone can say which dish to take off rather than "something went wrong".
      raise exception 'unavailable:%', coalesce(v_line->>'name', 'that dish')
        using errcode = 'no_data_found';
    end if;

    -- A variant replaces the base price; the label must be one the dish actually offers, or the
    -- price is whatever the phone claimed it was.
    if v_line->>'variant_label' is not null then
      select (e->>'price_cents')::int into v_unit
      from jsonb_array_elements(v_item.price_variants) e
      where e->>'label' = v_line->>'variant_label';
      if v_unit is null then
        raise exception 'unavailable:%', v_item.name using errcode = 'no_data_found';
      end if;
    else
      v_unit := v_item.price_cents;
      if v_unit is null then
        -- Priceless dishes exist on purpose (market price, "soup of the day") and cannot be
        -- ordered without someone saying what they cost.
        raise exception 'unavailable:%', v_item.name using errcode = 'no_data_found';
      end if;
    end if;

    -- Add-ons are matched against the dish's own list the same way, and their prices summed in.
    for v_add_on in select * from jsonb_array_elements(coalesce(v_line->'add_ons', '[]'::jsonb))
    loop
      -- SELECT INTO without STRICT sets the target to NULL when nothing matches, so this doubles
      -- as the "that add-on is not on this dish" check rather than needing a separate exists().
      select (e->>'price_cents')::int into v_extra
      from jsonb_array_elements(v_item.add_ons) e
      where e->>'label' = v_add_on->>'label';
      if v_extra is null then
        raise exception 'unavailable:%', v_item.name using errcode = 'no_data_found';
      end if;
      v_unit := v_unit + v_extra;
    end loop;

    v_line_cents := v_unit * v_qty;
    v_total := v_total + v_line_cents;

    insert into restaurant.order_items (
      order_id, menu_item_id, name_snapshot, variant_label, add_ons, unit_cents, qty, line_cents, position
    ) values (
      v_order_id, v_item.id, v_item.name, v_line->>'variant_label',
      coalesce(v_line->'add_ons', '[]'::jsonb), v_unit, v_qty, v_line_cents, v_pos
    );
    v_pos := v_pos + 1;
  end loop;

  update restaurant.orders set total_cents = v_total where id = v_order_id;
  return v_order_id;
end;
$$;

-- Same posture as every other table in this schema: RLS on, zero policies, deny-all for anon and
-- authenticated. Only service_role (held by Express) can reach this. See schema.sql's RLS section.
alter table restaurant.orders enable row level security;
alter table restaurant.order_items enable row level security;
grant all on restaurant.orders to service_role;
grant all on restaurant.order_items to service_role;
revoke all on function restaurant.place_order(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function restaurant.place_order(uuid, text, jsonb, text) to service_role;
alter default privileges in schema restaurant grant all on tables to service_role;

-- If the API answers "Could not find the table 'orders' in the schema cache":
--   notify pgrst, 'reload schema';
