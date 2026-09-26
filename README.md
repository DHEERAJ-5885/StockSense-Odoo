# StockSense — Design Handoff

Modular Inventory Management System. This folder holds the **working, clickable frontend design** and everything backend/database teammates need to wire it up.

## Run it

The screens are HTML files that load helper scripts, so serve the folder (don't double-click):

```
cd stocksense_design
npx serve .          # or: python3 -m http.server 8000
```

Open `http://localhost:3000` (or `:8000`). `index.html` → Login → Dashboard.

- Login: any Login ID + password of 6+ chars. Wrong → "Invalid Login Id or Password".
- Forgot password demo OTP: **482913**
- All data is in-memory sample data; refresh resets it.

## About these files

These are **high-fidelity design references built in HTML** — final colors, type, spacing, copy and interactions. The production app should recreate them in the team's chosen framework (React/Next.js recommended) and replace the in-memory data with API calls. Don't ship the HTML as-is.

## Files

| Path | What |
|---|---|
| `index.html` | Redirects to login |
| `Auth.dc.html` | Login, Sign up, Forgot password → OTP → New password → Done |
| `StockSense.dc.html` | The whole app (sidebar shell + every screen) |
| `support.js` | Runtime for the `.dc.html` files |
| `_ds/…/styles.css` | Design tokens + component classes (`.btn`, `.card`, `.table`, `.input`, `.tag`, `.seg`) |
| `reference/workflow.png`, `.excalidraw` | Original workflow from the team |
| `API_AND_DATA_MODEL.md` | Tables, endpoints, business rules for backend |

In `StockSense.dc.html`, the template is the markup; the `<script data-dc-script>` block at the bottom holds all logic and the sample data (`P0` products, `O0` operations, `L0` ledger, `W0` warehouses). Those constants show the exact data shapes the UI expects.

## Screens

Sidebar: Dashboard · Products · Operations (Receipts, Delivery Orders, Internal Transfers, Inventory Adjustments, Move History) · Settings → Warehouses · Profile menu (My Profile, Logout).
Top bar: product/SKU search (live dropdown), warehouse switcher, low-stock bell with count badge.

1. **Auth** — Login ID + password; sign-up with Login ID (6–12 chars, unique), name, email (unique), role (Inventory Manager / Warehouse Staff), password + re-enter; 3-step reset with 6-box OTP (auto-advance, paste, backspace, 30s resend timer).
2. **Dashboard** — 5 KPI cards; Receipts & Deliveries cards ("N to receive/deliver", late, waiting, upcoming); filter bar (document type, status chips, warehouse, category); Recent operations table; Low-stock alerts panel.
3. **Operation lists** (Receipts / Deliveries / Transfers) — search by reference or contact, list ↔ kanban toggle, status + warehouse filters, "Late" tag when scheduled date < today and not done.
4. **Receipt form** (WH/IN/0009) — status pipeline Draft › Ready › Done; supplier, source doc, responsible, scheduled date, destination; lines expected vs received; Validate / Set received = expected / Print / Cancel; success panel with "+qty" and before→after.
5. **Delivery form** (WH/OUT/0013) — Draft › Waiting › Ready › Done; steps Pick → Pack → Validate; lines with insufficient stock highlighted red; error if picking more than on hand; success "−qty".
6. **Internal transfer** (WH/INT/0006) — From/To location cards with before→after, swap button, "Total unchanged" note, editable product lines.
7. **Inventory adjustment** — product + location → recorded qty, counted qty, auto difference (±, color-coded), reason (Damaged / Lost / Count correction), note, Apply.
8. **Move History** — ledger: date/time, reference, operation, product, from → to, qty (+ green, − red, ⇄ grey for transfers), user; filters for date range, operation, product, warehouse, search.
9. **Products** — table (name, SKU, category, unit, unit cost ₹, on hand with inline Update, free to use, status badge); search, category, stock filter; empty state; create/edit form (initial stock optional); detail page (on hand / incoming / outgoing / reorder min, stock by location bars, reordering rule min/max/supplier, recent moves); Categories tab.
10. **Warehouses** — cards per warehouse with locations table, edit address/manager, add location, add warehouse.
11. **My Profile** — name, email, role (read-only), change password.

States shown: skeleton loading on navigation, empty states, validation errors (red border + message), success toasts (bottom-right, 6s).

Tweaks (props on `StockSense.dc.html`): `startScreen`, `simulateLoading`, `emptyProducts`. On `Auth.dc.html`: `startMode`.

## Design tokens

- Background `#f3f2f2`, surface `#eae9e9`, text `#201f1d`, accent `#b68235` (accent-700 `#7d5411` for small accent text), divider = text @ 16%.
- Neutral ramp 100–900: `#f8f4f4 #eae7e7 #d7d3d3 #bab6b6 #9b9797 #7d7979 #605d5d #444141 #2d2b2b`.
- Status colors (bg / text): Done/In stock `oklch(0.94 0.045 150)` / `oklch(0.40 0.09 150)` · Waiting/Low `oklch(0.945 0.06 80)` / `oklch(0.46 0.10 65)` · Canceled/Out `oklch(0.94 0.035 25)` / `oklch(0.46 0.14 27)` · Ready `oklch(0.94 0.03 245)` / `oklch(0.43 0.09 250)` · Draft neutral-200 / neutral-800.
- Fonts: headings Cormorant Garamond (≤600 weight, display sizes 400), body Lora. All quantities `font-variant-numeric: lining-nums tabular-nums`.
- Spacing: 4.6 / 9.2 / 13.8 / 18.4 / 27.6 / 36.8 px. Radius 2 / 4 / 7 px. Shadows sm/md/lg in `styles.css`.
- Buttons are outlined (accent border, transparent fill) — never solid.
- Tablet: hit targets ≥ 44px on floor-staff actions (qty inputs 48px).
- Icons: Lucide (inline SVG).
