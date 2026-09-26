# StockSense — API & Data Model (for backend team)

Suggested stack: PostgreSQL + Node/Express, Django, or Supabase. Shapes below match what the frontend already renders.

## Tables

```
users            id, login_id (unique, 6–12), name, email (unique), password_hash, role ('manager'|'staff'), created_at
password_otps    id, user_id, code_hash, expires_at (10 min), used_at
categories       id, name (unique)
products         id, name, sku (unique, A–Z 0–9 -), category_id, uom ('pcs'|'kg'|'m'|'L'|'cans'|'boxes'), unit_cost
reorder_rules    product_id (pk), min_qty, max_qty, preferred_supplier
warehouses       id, name, code (unique, e.g. WH, WH2), address, manager_user_id
locations        id, warehouse_id, name (unique, e.g. 'WH/Rack A'), kind ('Zone'|'Rack'|'Production floor'|'Shelf'|'Bin')
stock_quants     product_id, location_id, qty            -- pk(product_id, location_id)
operations       id, reference (unique, WH/IN/0009), type ('receipt'|'delivery'|'internal'|'adjustment'),
                 status ('draft'|'waiting'|'ready'|'done'|'canceled'), partner (supplier/customer),
                 source_location_id, dest_location_id, scheduled_date, responsible_user_id, source_document, packages, reason, note, validated_at
operation_lines  id, operation_id, product_id, qty_demand, qty_done
stock_moves      id, ts, operation_id, reference, type, product_id, from_label, to_label,
                 from_location_id NULL, to_location_id NULL, qty, direction ('in'|'out'|'move'), user_id, warehouse_id
```

References: `{WH code}/{IN|OUT|INT|ADJ}/{4-digit seq}`.

## Business rules

- **On hand** = sum of `stock_quants.qty` for a product. **Free to use** = on hand − qty in pending (draft/waiting/ready) deliveries.
- **Stock status**: 0 → Out of stock; < reorder min → Low stock; else In stock. Bell badge = count of low + out.
- **Late** = status not done/canceled AND scheduled_date < today. **Upcoming** = scheduled_date > today.
- Delivery is **Waiting** when any line's demand > on hand, else **Ready**.
- **Validate receipt**: qty_done ≥ 0, at least one > 0 → +qty to dest location, write `in` moves, status done.
- **Validate delivery**: Pick (qty ≤ on hand, ≤ demand) → Pack (packages ≥ 1) → Validate → −qty from source, `out` moves. Error text: "{Product}: picking X but only Y on hand".
- **Internal transfer**: src ≠ dst, qty ≤ qty at src → −src, +dst, `move` moves. Total unchanged.
- **Adjustment**: diff = counted − recorded (at that location); diff ≠ 0; write in/out move with reason.
- Every validation runs in **one DB transaction** (quants + moves + status).
- Canceling changes no stock.

## Auth rules

- Login error (always generic): "Invalid Login Id or Password".
- Sign-up: login_id 6–12 chars & unique; email unique; password > 8 chars with lowercase, uppercase and special char; confirm must match.
- Reset: POST email → send 6-digit OTP (email service) → verify → set new password (same rules).

## Endpoints

```
POST /auth/signup            {loginId, name, email, role, password}
POST /auth/login             {loginId, password}  → token
POST /auth/forgot            {email}
POST /auth/verify-otp        {email, code}        → resetToken
POST /auth/reset             {resetToken, password}
GET  /me   PATCH /me   POST /me/password {current, next}

GET  /dashboard?warehouse=&category=   → KPIs, receipt/delivery card counts, low-stock list
GET  /products?q=&category=&stock=     POST /products   PATCH /products/:id   GET /products/:id (with per-location qty, rule, recent moves)
PUT  /products/:id/reorder-rule        POST /products/:id/quick-update {qty}  (logs an adjustment)
GET  /categories   POST /categories

GET  /operations?type=&status=&warehouse=&q=
GET  /operations/:id   POST /operations   PATCH /operations/:id
POST /operations/:id/validate          POST /operations/:id/cancel
POST /operations/:id/pick   POST /operations/:id/pack     (deliveries)

GET  /moves?from=&to=&type=&product=&warehouse=&q=
GET  /warehouses   POST /warehouses   PATCH /warehouses/:id   POST /warehouses/:id/locations
GET  /search?q=    (products by name/SKU, top 6)
```

## Seed data (the demo story)

Products: Steel (kg), Steel Rods, Office Chairs, Wooden Frames, Bolts M8 (low), Paint 5L (out). Warehouses: Main Warehouse (Main Store, Production Rack, Rack A, Rack B), Warehouse 2 (Stock, Zone B).
Ledger: WH/IN/0007 Steel +100 → WH/INT/0005 Main Store → Production Rack 40 → WH/OUT/0012 Steel −20 → WH/ADJ/0004 Steel −3 damaged.
Full seed values are the `P0 / O0 / L0 / W0` constants in `StockSense.dc.html`.
