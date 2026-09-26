# StockSense — Database Layer

PostgreSQL / Supabase database layer for the StockSense inventory management
system. This directory is self-contained and does not touch any frontend or
unrelated backend code.

```
database/
├── migrations/
│   └── 001_initial_schema.sql   # tables, functions, triggers, RLS
├── seed/
│   └── seed.sql                 # demo data + the spec's test scenario
└── README.md
```

## 1. Running the migration

### Option A — Supabase CLI (recommended)
```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push          # applies database/migrations/001_initial_schema.sql
```
(Or copy the file into your project's own `supabase/migrations/` folder if
you're using the CLI's local migration workflow — the CLI just needs the
`.sql` file, the name/timestamp prefix is cosmetic.)

### Option B — Supabase SQL Editor
Open **SQL Editor** in the Supabase dashboard, paste the contents of
`migrations/001_initial_schema.sql`, and run it once against your project.

### Option C — psql
```bash
psql "$SUPABASE_DB_URL" -f database/migrations/001_initial_schema.sql
```

The migration is idempotent (`create table if not exists`, `create or
replace function`, etc.) so it is safe to re-run.

## 2. Running the seed data

Seed data inserts a demo row into `auth.users`, so it must be run with a
connection that can write to the `auth` schema and bypasses RLS — the
Supabase SQL Editor, or `psql`/the CLI connected as the `postgres` role.
**Do not run it against a production project** — it creates a demo login
(`demo.admin@stocksense.dev` / `StockSenseDemo123!`).

```bash
psql "$SUPABASE_DB_URL" -f database/seed/seed.sql
```

or paste `seed/seed.sql` into the SQL Editor and run it once. It is written
with `on conflict do nothing` guards for the reference data, but the test
scenario at the bottom (receipt → transfer → delivery → adjustment) will
create new documents each time it's re-run, so re-running the whole seed
file re-plays that scenario on top of whatever stock already exists.

## 3. Supabase configuration

- **Auth**: uses Supabase Auth (`auth.users`) directly — no custom
  password storage. A `public.profiles` row is auto-created for every new
  auth user via an `after insert on auth.users` trigger, and carries an
  app-level `role` (`admin` / `manager` / `staff`).
- **UUIDs**: every primary key is a `uuid` generated with `gen_random_uuid()`
  (from the `pgcrypto` extension, enabled by the migration).
- **RLS**: Row Level Security is enabled on every table. Current policies
  are hackathon-friendly: any authenticated user can read and write every
  business table; `profiles` can be read by any authenticated user but
  only updated by its owner. Nothing is exposed to `anon`, and no
  service-role key is used or required by the app — the frontend should
  talk to Supabase using the public **anon key** plus a signed-in user's
  session (RLS enforces access from there). Tighten the per-table
  policies against `profiles.role` before shipping this to real users.

## 4. Database structure

| Table | Purpose |
|---|---|
| `profiles` | App-level profile + role for each Supabase auth user |
| `categories` | Product categories |
| `products` | Catalog (unique `sku`) |
| `warehouses` | Physical warehouses |
| `locations` | Storage locations, each belonging to one warehouse |
| `stock` | Current quantity per `(product, location)` — one row per pair |
| `receipts` / `receipt_items` | Goods coming in from a supplier |
| `deliveries` / `delivery_items` | Goods going out to a customer |
| `internal_transfers` / `internal_transfer_items` | Stock moved between locations |
| `inventory_adjustments` / `inventory_adjustment_items` | Physical count corrections |
| `stock_ledger` | Append-only audit trail of every stock-changing operation |
| `reordering_rules` | Reorder point / min / max per product+location |

Documents (`receipts`, `deliveries`, `internal_transfers`,
`inventory_adjustments`) move through the same status lifecycle:
`Draft → Waiting → Ready → Done` (or `Canceled` at any point before `Done`).
References are generated automatically in the `WH/IN/000N`, `WH/OUT/000N`,
`WH/INT/000N`, `WH/ADJ/000N` format via per-type sequences.

## 5. Stock flow

Stock is only ever changed by calling one of four RPC functions — never by
writing directly to the `stock` table. Each function is a single
PL/pgSQL call, so it is fully transactional: if anything inside it raises
an exception, every change it made (stock updates *and* ledger rows) is
rolled back and the document's status is left untouched.

| Function | Effect |
|---|---|
| `validate_receipt(receipt_id)` | Increases stock at each item's location, writes a `RECEIPT` / `IN` ledger row per item, sets the receipt to `Done`. |
| `validate_delivery(delivery_id)` | Decreases stock at each item's location. If any item doesn't have enough stock, the call raises and **nothing** is applied. Writes a `DELIVERY` / `OUT` ledger row per item, sets the delivery to `Done`. |
| `validate_internal_transfer(transfer_id)` | Decreases stock at each item's source location and increases it by the same amount at the destination — total stock is unchanged. Writes one `INTERNAL_TRANSFER` / `TRANSFER` ledger row per item. |
| `validate_inventory_adjustment(adjustment_id)` | For each item, applies `counted_quantity - recorded_quantity` (a generated column) to stock at the adjustment's location. Writes an `ADJUSTMENT` ledger row (`IN` if the difference is positive, `OUT` if negative) unless the difference is zero. |

All four sit on top of a shared helper, `adjust_stock(product_id,
warehouse_id, location_id, delta)`, which locks the relevant `stock` row
(`for update`), applies the delta, and raises an exception rather than
letting quantity go negative.

`seed/seed.sql` replays the exact scenario from the spec through these
functions (Steel Rod: 100 → +50 receipt → 30 transferred Rack A→Rack B →
20 delivered from Rack B → adjustment −2 at Rack B), ending at **Rack A =
120, Rack B = 8, total = 128**, with all four operations recorded in
`stock_ledger`.

## 6. How the frontend/backend should connect

- Use the Supabase client SDK (`@supabase/supabase-js` or equivalent) with
  the project URL and **anon key** — never the service-role key in
  frontend or client-callable backend code.
- Read data (dashboards, product lists, stock levels, ledger history) via
  normal `select` queries against the tables above — RLS will scope what
  an authenticated user can see.
- Create documents (`receipts`, `deliveries`, `internal_transfers`,
  `inventory_adjustments`, and their `_items`) with normal `insert`
  queries, leaving `status` at its default (`Draft`) until the operator is
  ready to complete it.
- To actually move stock, call the matching RPC from the client, e.g.:
  ```js
  const { error } = await supabase.rpc('validate_receipt', { p_receipt_id: receiptId });
  ```
  (`validate_delivery`, `validate_internal_transfer`, and
  `validate_inventory_adjustment` take the equivalent single `p_*_id`
  argument.) Surface `error.message` to the user — it will contain a
  human-readable "insufficient stock" message when a delivery can't be
  completed.
- Never write to `stock` or `stock_ledger` directly from the frontend;
  always go through the RPC functions so every change is validated and
  audited.

## 7. Verification

The migration and this seed script were run end-to-end against a local
PostgreSQL 16 instance (with a minimal stand-in for Supabase's `auth`
schema) while preparing this PR: the migration applies cleanly, the seed
scenario produces exactly the stock levels and ledger rows described in
the spec, and an over-sized delivery is correctly rejected with no partial
stock changes.
