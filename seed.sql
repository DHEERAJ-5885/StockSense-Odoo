-- =====================================================================
-- StockSense - Demo Seed Data
-- =====================================================================
-- Run this with a connection that can write to auth.users and bypasses
-- RLS (the Supabase SQL editor, or `psql` connected as the `postgres`
-- role / via the Supabase CLI's `supabase db execute`). Do not run this
-- against a production project -- it creates a demo login.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Demo user (auth.users) + matching profile
-- ---------------------------------------------------------------------
-- In real usage, users sign up through Supabase Auth (email/password,
-- magic link, OAuth, ...) and GoTrue populates auth.users itself -- the
-- on_auth_user_created trigger then creates the matching profiles row.
-- This direct insert only exists so the seed script has a real user id
-- to attach demo records (created_by) to.
insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role
) values (
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'demo.admin@stocksense.dev',
    crypt('StockSenseDemo123!', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Demo Admin"}',
    'authenticated', 'authenticated'
)
on conflict (id) do nothing;

update public.profiles
   set role = 'admin', full_name = 'Demo Admin'
 where id = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------
insert into public.categories (id, name, description) values
    ('a0000000-0000-0000-0000-000000000001', 'Raw Materials',   'Unprocessed and semi-processed materials'),
    ('a0000000-0000-0000-0000-000000000002', 'Electronics',     'Electronic components and finished devices'),
    ('a0000000-0000-0000-0000-000000000003', 'Office Supplies', 'General office consumables and equipment')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------
insert into public.products (id, name, sku, category_id, unit_of_measure, initial_stock) values
    ('b0000000-0000-0000-0000-000000000001', 'Steel Rod',   'RM-STEEL-001',  'a0000000-0000-0000-0000-000000000001', 'kg',   100),
    ('b0000000-0000-0000-0000-000000000002', 'Copper Wire', 'RM-COPPER-001', 'a0000000-0000-0000-0000-000000000001', 'm',    200),
    ('b0000000-0000-0000-0000-000000000003', 'Laptop',      'EL-LAPTOP-001', 'a0000000-0000-0000-0000-000000000002', 'unit',  25),
    ('b0000000-0000-0000-0000-000000000004', 'Keyboard',    'EL-KEYB-001',   'a0000000-0000-0000-0000-000000000002', 'unit',  60),
    ('b0000000-0000-0000-0000-000000000005', 'Mouse',       'EL-MOUSE-001',  'a0000000-0000-0000-0000-000000000002', 'unit',  80)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Warehouses
-- ---------------------------------------------------------------------
insert into public.warehouses (id, name, short_code, address) values
    ('c0000000-0000-0000-0000-000000000001', 'Main Warehouse',      'MAIN', '1 Industrial Ave, Hyderabad'),
    ('c0000000-0000-0000-0000-000000000002', 'Secondary Warehouse', 'SEC',  '22 Depot Road, Hyderabad')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Locations
-- ---------------------------------------------------------------------
insert into public.locations (id, warehouse_id, name, short_code) values
    ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Rack A', 'RACK-A'),
    ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Rack B', 'RACK-B'),
    ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'Rack C', 'RACK-C')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Baseline stock (demo data so the dashboard has something to show)
-- ---------------------------------------------------------------------
insert into public.stock (product_id, warehouse_id, location_id, quantity) values
    ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 100), -- Steel Rod   @ Rack A
    ('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 200), -- Copper Wire @ Rack A
    ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 25),  -- Laptop      @ Rack B
    ('b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 60),  -- Keyboard    @ Rack C
    ('b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 80)   -- Mouse       @ Rack C
on conflict (product_id, location_id) do nothing;

-- ---------------------------------------------------------------------
-- Reordering rules
-- ---------------------------------------------------------------------
insert into public.reordering_rules (product_id, warehouse_id, location_id, reorder_point, minimum_quantity, maximum_quantity) values
    ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 40, 20, 300),
    ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 10, 5,  50)
on conflict (product_id, warehouse_id, location_id) do nothing;

-- =====================================================================
-- Test scenario (spec section 17) -- driven entirely through the
-- validate_* RPC functions so it also exercises the stock ledger.
--
--   Start:     Steel Rod = 100 @ Rack A
--   Receipt:   +50                          -> 150
--   Transfer:  30  Rack A -> Rack B         -> Rack A 120 / Rack B 30
--   Delivery:  20 from Rack B               -> Rack B 10  (total 130)
--   Adjustment: recorded 10, counted 8      -> Rack B 8   (total 128)
-- =====================================================================

-- --- Receipt: +50 Steel Rod at Rack A --------------------------------
do $$
declare
    v_receipt_id uuid;
begin
    insert into public.receipts (warehouse_id, supplier, status, created_by)
    values ('c0000000-0000-0000-0000-000000000001', 'Acme Steel Co.', 'Ready',
            '11111111-1111-1111-1111-111111111111')
    returning id into v_receipt_id;

    insert into public.receipt_items (receipt_id, product_id, location_id, quantity, unit)
    values (v_receipt_id, 'b0000000-0000-0000-0000-000000000001',
            'd0000000-0000-0000-0000-000000000001', 50, 'kg');

    perform public.validate_receipt(v_receipt_id);
end $$;

-- --- Internal transfer: 30 Steel Rod, Rack A -> Rack B ---------------
do $$
declare
    v_transfer_id uuid;
begin
    insert into public.internal_transfers (warehouse_id, status, created_by)
    values ('c0000000-0000-0000-0000-000000000001', 'Ready',
            '11111111-1111-1111-1111-111111111111')
    returning id into v_transfer_id;

    insert into public.internal_transfer_items (
        transfer_id, product_id, source_location_id, destination_location_id, quantity
    ) values (
        v_transfer_id, 'b0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000002', 30
    );

    perform public.validate_internal_transfer(v_transfer_id);
end $$;

-- --- Delivery: 20 Steel Rod from Rack B ------------------------------
do $$
declare
    v_delivery_id uuid;
begin
    insert into public.deliveries (warehouse_id, customer, status, created_by)
    values ('c0000000-0000-0000-0000-000000000001', 'BuildRight Contractors', 'Ready',
            '11111111-1111-1111-1111-111111111111')
    returning id into v_delivery_id;

    insert into public.delivery_items (delivery_id, product_id, location_id, quantity, unit)
    values (v_delivery_id, 'b0000000-0000-0000-0000-000000000001',
            'd0000000-0000-0000-0000-000000000002', 20, 'kg');

    perform public.validate_delivery(v_delivery_id);
end $$;

-- --- Inventory adjustment: recorded 10, counted 8 @ Rack B -----------
do $$
declare
    v_adjustment_id uuid;
begin
    insert into public.inventory_adjustments (warehouse_id, location_id, status, created_by)
    values ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'Ready',
            '11111111-1111-1111-1111-111111111111')
    returning id into v_adjustment_id;

    insert into public.inventory_adjustment_items (adjustment_id, product_id, recorded_quantity, counted_quantity)
    values (v_adjustment_id, 'b0000000-0000-0000-0000-000000000001', 10, 8);

    perform public.validate_inventory_adjustment(v_adjustment_id);
end $$;

commit;

-- =====================================================================
-- Verification queries (run manually to sanity-check the scenario)
-- =====================================================================
-- select l.short_code, s.quantity
--   from public.stock s join public.locations l on l.id = s.location_id
--  where s.product_id = 'b0000000-0000-0000-0000-000000000001';
-- expect: RACK-A = 120, RACK-B = 8   (total 128)
--
-- select operation_type, quantity, direction
--   from public.stock_ledger
--  where product_id = 'b0000000-0000-0000-0000-000000000001'
--  order by created_at;
-- expect 4 rows: RECEIPT/50/IN, INTERNAL_TRANSFER/30/TRANSFER,
--                DELIVERY/20/OUT, ADJUSTMENT/2/OUT
