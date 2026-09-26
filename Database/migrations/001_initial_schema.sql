-- =====================================================================
-- StockSense - Initial Schema Migration
-- =====================================================================
-- Target: Supabase PostgreSQL
-- Scope:  database/ layer only (auth, inventory, stock movements, RLS)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid(), crypt()

-- ---------------------------------------------------------------------
-- 1. Profiles (linked to Supabase auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
    id            uuid primary key references auth.users (id) on delete cascade,
    full_name     text,
    role          text not null default 'staff' check (role in ('admin', 'manager', 'staff')),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'App-level profile for each Supabase authenticated user.';

-- ---------------------------------------------------------------------
-- 2. Categories
-- ---------------------------------------------------------------------
create table if not exists public.categories (
    id            uuid primary key default gen_random_uuid(),
    name          text not null unique,
    description   text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Products
-- ---------------------------------------------------------------------
create table if not exists public.products (
    id              uuid primary key default gen_random_uuid(),
    name            text not null,
    sku             text not null unique,
    category_id     uuid references public.categories (id) on delete set null,
    unit_of_measure text not null default 'unit',
    initial_stock   numeric(14,3) not null default 0 check (initial_stock >= 0),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_products_category_id on public.products (category_id);

-- ---------------------------------------------------------------------
-- 4. Warehouses
-- ---------------------------------------------------------------------
create table if not exists public.warehouses (
    id            uuid primary key default gen_random_uuid(),
    name          text not null,
    short_code    text not null unique,
    address       text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. Locations (each belongs to exactly one warehouse)
-- ---------------------------------------------------------------------
create table if not exists public.locations (
    id            uuid primary key default gen_random_uuid(),
    warehouse_id  uuid not null references public.warehouses (id) on delete cascade,
    name          text not null,
    short_code    text not null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (warehouse_id, short_code)
);

create index if not exists idx_locations_warehouse_id on public.locations (warehouse_id);

-- ---------------------------------------------------------------------
-- 6. Stock (per product + location; one row per combination)
-- ---------------------------------------------------------------------
create table if not exists public.stock (
    id            uuid primary key default gen_random_uuid(),
    product_id    uuid not null references public.products (id) on delete cascade,
    warehouse_id  uuid not null references public.warehouses (id) on delete cascade,
    location_id   uuid not null references public.locations (id) on delete cascade,
    quantity      numeric(14,3) not null default 0 check (quantity >= 0),
    updated_at    timestamptz not null default now(),
    unique (product_id, location_id)
);

create index if not exists idx_stock_product_id on public.stock (product_id);
create index if not exists idx_stock_warehouse_id on public.stock (warehouse_id);
create index if not exists idx_stock_location_id on public.stock (location_id);

-- Status / operation_type / direction are implemented as check constraints
-- (rather than native enums) so the schema is easy to extend from Supabase
-- Studio without an ALTER TYPE migration.
--   status:         Draft | Waiting | Ready | Done | Canceled
--   operation_type: RECEIPT | DELIVERY | INTERNAL_TRANSFER | ADJUSTMENT
--   direction:      IN | OUT | TRANSFER

-- ---------------------------------------------------------------------
-- 7. Receipts (goods coming IN from a supplier)
-- ---------------------------------------------------------------------
create sequence if not exists public.receipt_ref_seq;

create or replace function public.generate_receipt_reference()
returns text language sql as $$
    select 'WH/IN/' || lpad(nextval('public.receipt_ref_seq')::text, 4, '0');
$$;

create table if not exists public.receipts (
    id             uuid primary key default gen_random_uuid(),
    reference      text not null unique default public.generate_receipt_reference(),
    supplier       text,
    warehouse_id   uuid not null references public.warehouses (id),
    scheduled_date date,
    status         text not null default 'Draft'
                   check (status in ('Draft','Waiting','Ready','Done','Canceled')),
    created_by     uuid references auth.users (id),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create table if not exists public.receipt_items (
    id            uuid primary key default gen_random_uuid(),
    receipt_id    uuid not null references public.receipts (id) on delete cascade,
    product_id    uuid not null references public.products (id),
    location_id   uuid not null references public.locations (id),
    quantity      numeric(14,3) not null check (quantity > 0),
    unit          text
);

create index if not exists idx_receipt_items_receipt_id on public.receipt_items (receipt_id);

-- ---------------------------------------------------------------------
-- 8. Deliveries (goods going OUT to a customer)
-- ---------------------------------------------------------------------
create sequence if not exists public.delivery_ref_seq;

create or replace function public.generate_delivery_reference()
returns text language sql as $$
    select 'WH/OUT/' || lpad(nextval('public.delivery_ref_seq')::text, 4, '0');
$$;

create table if not exists public.deliveries (
    id             uuid primary key default gen_random_uuid(),
    reference      text not null unique default public.generate_delivery_reference(),
    customer       text,
    warehouse_id   uuid not null references public.warehouses (id),
    scheduled_date date,
    status         text not null default 'Draft'
                   check (status in ('Draft','Waiting','Ready','Done','Canceled')),
    created_by     uuid references auth.users (id),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create table if not exists public.delivery_items (
    id            uuid primary key default gen_random_uuid(),
    delivery_id   uuid not null references public.deliveries (id) on delete cascade,
    product_id    uuid not null references public.products (id),
    location_id   uuid not null references public.locations (id),
    quantity      numeric(14,3) not null check (quantity > 0),
    unit          text
);

create index if not exists idx_delivery_items_delivery_id on public.delivery_items (delivery_id);

-- ---------------------------------------------------------------------
-- 9. Internal Transfers (move stock between locations, net-zero total)
-- ---------------------------------------------------------------------
create sequence if not exists public.transfer_ref_seq;

create or replace function public.generate_transfer_reference()
returns text language sql as $$
    select 'WH/INT/' || lpad(nextval('public.transfer_ref_seq')::text, 4, '0');
$$;

create table if not exists public.internal_transfers (
    id             uuid primary key default gen_random_uuid(),
    reference      text not null unique default public.generate_transfer_reference(),
    warehouse_id   uuid not null references public.warehouses (id),
    scheduled_date date,
    status         text not null default 'Draft'
                   check (status in ('Draft','Waiting','Ready','Done','Canceled')),
    created_by     uuid references auth.users (id),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create table if not exists public.internal_transfer_items (
    id                       uuid primary key default gen_random_uuid(),
    transfer_id              uuid not null references public.internal_transfers (id) on delete cascade,
    product_id               uuid not null references public.products (id),
    source_location_id       uuid not null references public.locations (id),
    destination_location_id  uuid not null references public.locations (id),
    quantity                 numeric(14,3) not null check (quantity > 0),
    check (source_location_id <> destination_location_id)
);

create index if not exists idx_transfer_items_transfer_id on public.internal_transfer_items (transfer_id);

-- ---------------------------------------------------------------------
-- 10. Inventory Adjustments (physical count corrections)
-- ---------------------------------------------------------------------
create sequence if not exists public.adjustment_ref_seq;

create or replace function public.generate_adjustment_reference()
returns text language sql as $$
    select 'WH/ADJ/' || lpad(nextval('public.adjustment_ref_seq')::text, 4, '0');
$$;

create table if not exists public.inventory_adjustments (
    id             uuid primary key default gen_random_uuid(),
    reference      text not null unique default public.generate_adjustment_reference(),
    warehouse_id   uuid not null references public.warehouses (id),
    location_id    uuid not null references public.locations (id),
    status         text not null default 'Draft'
                   check (status in ('Draft','Waiting','Ready','Done','Canceled')),
    created_by     uuid references auth.users (id),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create table if not exists public.inventory_adjustment_items (
    id                 uuid primary key default gen_random_uuid(),
    adjustment_id      uuid not null references public.inventory_adjustments (id) on delete cascade,
    product_id         uuid not null references public.products (id),
    recorded_quantity  numeric(14,3) not null check (recorded_quantity >= 0),
    counted_quantity   numeric(14,3) not null check (counted_quantity >= 0),
    difference         numeric(14,3) generated always as (counted_quantity - recorded_quantity) stored
);

create index if not exists idx_adjustment_items_adjustment_id on public.inventory_adjustment_items (adjustment_id);

-- ---------------------------------------------------------------------
-- 11. Stock Ledger (immutable audit trail of every stock change)
-- ---------------------------------------------------------------------
create table if not exists public.stock_ledger (
    id                uuid primary key default gen_random_uuid(),
    reference         text not null,
    product_id        uuid not null references public.products (id),
    operation_type    text not null check (operation_type in ('RECEIPT','DELIVERY','INTERNAL_TRANSFER','ADJUSTMENT')),
    warehouse_id      uuid not null references public.warehouses (id),
    from_location_id  uuid references public.locations (id),
    to_location_id    uuid references public.locations (id),
    quantity          numeric(14,3) not null check (quantity > 0),
    direction         text not null check (direction in ('IN','OUT','TRANSFER')),
    created_at        timestamptz not null default now(),
    created_by        uuid references auth.users (id)
);

create index if not exists idx_ledger_product_id on public.stock_ledger (product_id);
create index if not exists idx_ledger_warehouse_id on public.stock_ledger (warehouse_id);
create index if not exists idx_ledger_operation_type on public.stock_ledger (operation_type);
create index if not exists idx_ledger_created_at on public.stock_ledger (created_at);

-- ---------------------------------------------------------------------
-- 12. Reordering Rules
-- ---------------------------------------------------------------------
create table if not exists public.reordering_rules (
    id                uuid primary key default gen_random_uuid(),
    product_id        uuid not null references public.products (id) on delete cascade,
    warehouse_id      uuid not null references public.warehouses (id) on delete cascade,
    location_id       uuid references public.locations (id) on delete cascade,
    reorder_point     numeric(14,3) not null default 0 check (reorder_point >= 0),
    minimum_quantity  numeric(14,3) not null default 0 check (minimum_quantity >= 0),
    maximum_quantity  numeric(14,3) not null check (maximum_quantity >= minimum_quantity),
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    unique (product_id, warehouse_id, location_id)
);

-- =====================================================================
-- Triggers: updated_at maintenance
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

do $$
declare
    t text;
begin
    for t in select unnest(array[
        'profiles','categories','products','warehouses','locations',
        'receipts','deliveries','internal_transfers',
        'inventory_adjustments','reordering_rules'
    ])
    loop
        execute format(
            'drop trigger if exists set_updated_at on public.%I;
             create trigger set_updated_at before update on public.%I
             for each row execute function public.set_updated_at();', t, t
        );
    end loop;
end $$;

-- public.stock.updated_at is maintained explicitly inside adjust_stock()

-- =====================================================================
-- Trigger: auto-create a profile row for every new Supabase auth user
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles (id, full_name)
    values (new.id, new.raw_user_meta_data ->> 'full_name')
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- =====================================================================
-- Core helper: safely increase/decrease stock, never below zero
-- =====================================================================
create or replace function public.adjust_stock(
    p_product_id   uuid,
    p_warehouse_id uuid,
    p_location_id  uuid,
    p_delta        numeric
) returns void language plpgsql as $$
declare
    v_current numeric;
begin
    select quantity into v_current
      from public.stock
     where product_id = p_product_id and location_id = p_location_id
     for update;

    if not found then
        if p_delta < 0 then
            raise exception 'Insufficient stock for product % at location %', p_product_id, p_location_id;
        end if;
        insert into public.stock (product_id, warehouse_id, location_id, quantity)
        values (p_product_id, p_warehouse_id, p_location_id, p_delta);
    else
        if v_current + p_delta < 0 then
            raise exception 'Insufficient stock for product % at location % (have %, need %)',
                p_product_id, p_location_id, v_current, abs(p_delta);
        end if;
        update public.stock
           set quantity = v_current + p_delta, updated_at = now()
         where product_id = p_product_id and location_id = p_location_id;
    end if;
end;
$$;

-- =====================================================================
-- RPC: validate_receipt
-- Increases stock for every receipt item and writes a RECEIPT ledger row.
-- =====================================================================
create or replace function public.validate_receipt(p_receipt_id uuid)
returns void language plpgsql as $$
declare
    r_receipt public.receipts%rowtype;
    r_item    public.receipt_items%rowtype;
begin
    select * into r_receipt from public.receipts where id = p_receipt_id for update;

    if not found then
        raise exception 'Receipt % not found', p_receipt_id;
    end if;

    if r_receipt.status in ('Done','Canceled') then
        raise exception 'Receipt % already in a final state (%)', p_receipt_id, r_receipt.status;
    end if;

    for r_item in select * from public.receipt_items where receipt_id = p_receipt_id loop
        perform public.adjust_stock(r_item.product_id, r_receipt.warehouse_id, r_item.location_id, r_item.quantity);

        insert into public.stock_ledger (
            reference, product_id, operation_type, warehouse_id,
            from_location_id, to_location_id, quantity, direction, created_by
        ) values (
            r_receipt.reference, r_item.product_id, 'RECEIPT', r_receipt.warehouse_id,
            null, r_item.location_id, r_item.quantity, 'IN', r_receipt.created_by
        );
    end loop;

    update public.receipts set status = 'Done', updated_at = now() where id = p_receipt_id;
end;
$$;

-- =====================================================================
-- RPC: validate_delivery
-- Fails the whole call (rolling back every change made inside it) if any
-- item does not have enough stock; otherwise decreases stock and writes
-- a DELIVERY ledger row per item.
-- =====================================================================
create or replace function public.validate_delivery(p_delivery_id uuid)
returns void language plpgsql as $$
declare
    r_delivery public.deliveries%rowtype;
    r_item     public.delivery_items%rowtype;
begin
    select * into r_delivery from public.deliveries where id = p_delivery_id for update;

    if not found then
        raise exception 'Delivery % not found', p_delivery_id;
    end if;

    if r_delivery.status in ('Done','Canceled') then
        raise exception 'Delivery % already in a final state (%)', p_delivery_id, r_delivery.status;
    end if;

    for r_item in select * from public.delivery_items where delivery_id = p_delivery_id loop
        perform public.adjust_stock(r_item.product_id, r_delivery.warehouse_id, r_item.location_id, -r_item.quantity);

        insert into public.stock_ledger (
            reference, product_id, operation_type, warehouse_id,
            from_location_id, to_location_id, quantity, direction, created_by
        ) values (
            r_delivery.reference, r_item.product_id, 'DELIVERY', r_delivery.warehouse_id,
            r_item.location_id, null, r_item.quantity, 'OUT', r_delivery.created_by
        );
    end loop;

    update public.deliveries set status = 'Done', updated_at = now() where id = p_delivery_id;
end;
$$;

-- =====================================================================
-- RPC: validate_internal_transfer
-- Moves stock between two locations; total stock is unchanged because
-- the same quantity is removed from the source and added to the
-- destination inside this single transactional call.
-- =====================================================================
create or replace function public.validate_internal_transfer(p_transfer_id uuid)
returns void language plpgsql as $$
declare
    r_transfer public.internal_transfers%rowtype;
    r_item     public.internal_transfer_items%rowtype;
begin
    select * into r_transfer from public.internal_transfers where id = p_transfer_id for update;

    if not found then
        raise exception 'Internal transfer % not found', p_transfer_id;
    end if;

    if r_transfer.status in ('Done','Canceled') then
        raise exception 'Internal transfer % already in a final state (%)', p_transfer_id, r_transfer.status;
    end if;

    for r_item in select * from public.internal_transfer_items where transfer_id = p_transfer_id loop
        perform public.adjust_stock(r_item.product_id, r_transfer.warehouse_id, r_item.source_location_id, -r_item.quantity);
        perform public.adjust_stock(r_item.product_id, r_transfer.warehouse_id, r_item.destination_location_id, r_item.quantity);

        insert into public.stock_ledger (
            reference, product_id, operation_type, warehouse_id,
            from_location_id, to_location_id, quantity, direction, created_by
        ) values (
            r_transfer.reference, r_item.product_id, 'INTERNAL_TRANSFER', r_transfer.warehouse_id,
            r_item.source_location_id, r_item.destination_location_id, r_item.quantity, 'TRANSFER', r_transfer.created_by
        );
    end loop;

    update public.internal_transfers set status = 'Done', updated_at = now() where id = p_transfer_id;
end;
$$;

-- =====================================================================
-- RPC: validate_inventory_adjustment
-- Applies (counted_quantity - recorded_quantity) to stock and writes an
-- ADJUSTMENT ledger row per item that actually changed.
-- =====================================================================
create or replace function public.validate_inventory_adjustment(p_adjustment_id uuid)
returns void language plpgsql as $$
declare
    r_adj  public.inventory_adjustments%rowtype;
    r_item public.inventory_adjustment_items%rowtype;
begin
    select * into r_adj from public.inventory_adjustments where id = p_adjustment_id for update;

    if not found then
        raise exception 'Inventory adjustment % not found', p_adjustment_id;
    end if;

    if r_adj.status in ('Done','Canceled') then
        raise exception 'Inventory adjustment % already in a final state (%)', p_adjustment_id, r_adj.status;
    end if;

    for r_item in select * from public.inventory_adjustment_items where adjustment_id = p_adjustment_id loop
        perform public.adjust_stock(r_item.product_id, r_adj.warehouse_id, r_adj.location_id, r_item.difference);

        if r_item.difference <> 0 then
            insert into public.stock_ledger (
                reference, product_id, operation_type, warehouse_id,
                from_location_id, to_location_id, quantity, direction, created_by
            ) values (
                r_adj.reference, r_item.product_id, 'ADJUSTMENT', r_adj.warehouse_id,
                case when r_item.difference < 0 then r_adj.location_id else null end,
                case when r_item.difference >= 0 then r_adj.location_id else null end,
                abs(r_item.difference),
                case when r_item.difference >= 0 then 'IN' else 'OUT' end,
                r_adj.created_by
            );
        end if;
    end loop;

    update public.inventory_adjustments set status = 'Done', updated_at = now() where id = p_adjustment_id;
end;
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.warehouses enable row level security;
alter table public.locations enable row level security;
alter table public.stock enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_items enable row level security;
alter table public.internal_transfers enable row level security;
alter table public.internal_transfer_items enable row level security;
alter table public.inventory_adjustments enable row level security;
alter table public.inventory_adjustment_items enable row level security;
alter table public.stock_ledger enable row level security;
alter table public.reordering_rules enable row level security;

-- profiles: any authenticated user can view the directory; a user can
-- only insert/update their own row.
create policy "profiles_select_authenticated" on public.profiles
    for select using (auth.role() = 'authenticated');
create policy "profiles_update_own" on public.profiles
    for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
    for insert with check (auth.uid() = id);

-- All other business tables: any authenticated user can read and write.
-- This is a hackathon-friendly default -- tighten per role (admin /
-- manager / staff) with policies against public.profiles.role for a
-- production deployment.
do $$
declare
    t text;
begin
    for t in select unnest(array[
        'categories','products','warehouses','locations','stock',
        'receipts','receipt_items','deliveries','delivery_items',
        'internal_transfers','internal_transfer_items',
        'inventory_adjustments','inventory_adjustment_items',
        'stock_ledger','reordering_rules'
    ])
    loop
        execute format(
            'create policy "%1$s_select_authenticated" on public.%1$I for select using (auth.role() = ''authenticated'');', t
        );
        execute format(
            'create policy "%1$s_insert_authenticated" on public.%1$I for insert with check (auth.role() = ''authenticated'');', t
        );
        execute format(
            'create policy "%1$s_update_authenticated" on public.%1$I for update using (auth.role() = ''authenticated'');', t
        );
        execute format(
            'create policy "%1$s_delete_authenticated" on public.%1$I for delete using (auth.role() = ''authenticated'');', t
        );
    end loop;
end $$;

-- =====================================================================
-- End of migration
-- =====================================================================
