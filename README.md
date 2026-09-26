# StockSense — Design Handoff

Modular Inventory Management System. This folder holds the **working, clickable frontend design** and everything backend/database teammates need to wire it up.

## Run it

The screens are HTML files that load helper scripts, so serve the folder (don't double-click):

```
python serve.py       # recommended: serves with caching off so edits always show
                     # (or: npx serve .  /  python -m http.server 8000)
```

Open `http://localhost:3000` (or `:8000`). `index.html` → Login → Dashboard.

- **Sign-in uses Supabase Auth** (project in `config.js`): Login ID or email + password and sign-up. **Forgot password** emails a 6-digit code through the backend with **Nodemailer** (start it with `cd backend && npm install && npm start`, and put your SMTP details in `backend/.env`; with none set, the code is printed in the backend console). Wrong credentials → "Invalid Login Id or Password"; opening the app without a session sends you to the login page. **One-time setup:** see `Database/AUTH_SETUP.md`. Stock data (products, receipts, deliveries…) is still held in the browser and resets on refresh.
- No internet / no Supabase yet? Open `Auth.dc.html?local=1` for the browser-only mode: demo accounts `priya.nair` / `Priya@2026` and `ravi.mehta` / `Ravi@2026` (**Inventory Manager**), `anya.khan` / `Anya@2026` (**Warehouse Staff**), demo reset code `482913`. Users are stored in `localStorage` with SHA-256 hashed passwords.
- Forgot password demo OTP: **482913**
- All data is in-memory sample data; refresh resets it (including anything done as a different role).

## Roles

The login page passes the user's name and role to the app (`sessionStorage`). This is a front-end prototype only; real enforcement belongs in the API and database rules.

| Area | Inventory Manager | Warehouse Staff |
|---|---|---|
| Dashboard | KPIs, alerts, all operations | Task view: pick & pack, transfers, shelves to check |
| Receipts | Create, validate, cancel | View only (can print PDF) |
| Deliveries | Create, pick, pack, validate, cancel | Pick and pack; manager validates |
| Internal transfers | Full access | Full access |
| Inventory adjustments | Full access | Full access |
| Products, categories, reorder rules | Create, edit | View only |
| Warehouses (settings) | Full access | Hidden |
| Move history | Read | Read |

## About these files

These are **high-fidelity design references built in HTML** — final colors, type, spacing, copy and interactions. The production app should recreate them in the team's chosen framework (React/Next.js recommended) and replace the in-memory data with API calls. Don't ship the HTML as-is.

## Files

| Path | What |
|---|---|
| `index.html` | Redirects to login |
| `Auth.dc.html` | Login, Sign up, Forgot password → OTP → New password → Done |
| `StockSense.dc.html` | The whole app (sidebar shell + every screen) |
| `support.js` | Runtime for the `.dc.html` files |
| `styles.css`, `_ds_bundle.js` | Design tokens + component classes (`.btn`, `.card`, `.table`, `.input`, `.tag`, `.seg`) |
| `workflow.png`, `workflow.excalidraw` | Original workflow from the team |
| `API_AND_DATA_MODEL.md` | Tables, endpoints, business rules for backend |

In `StockSense.dc.html`, the template is the markup; the `<script data-dc-script>` block at the bottom holds all logic and the sample data (`P0` products, `O0` operations, `L0` ledger, `W0` warehouses). Those constants show the exact data shapes the UI expects.

## Screens

Sidebar: Dashboard · Products · Operations (Receipts, Delivery Orders, Internal Transfers, Inventory Adjustments, Move History) · Settings → Warehouses · Profile menu (My Profile, Logout).
Top bar: product/SKU search (live dropdown), warehouse switcher, low-stock bell with count badge.

1. **Auth** — Login ID + password; sign-up with Login ID (6–12 chars, unique), name, email (unique), role (Inventory Manager / Warehouse Staff), password + re-enter; 3-step reset with 6-box OTP (auto-advance, paste, backspace, 30s resend timer).
2. **Dashboard** — 5 KPI cards; Receipts & Deliveries cards ("N to receive/deliver", late, waiting, upcoming); filter bar (document type, status chips, warehouse, **location**, category); Recent operations table; Low-stock alerts panel.
3. **Operation lists** (Receipts / Deliveries / Transfers) — **New** creates a Draft with the next reference; search by reference or contact, list ↔ kanban toggle by status, status + warehouse filters, "Late" tag when scheduled date < today and not done.
4. **Receipt form** — reference `<Warehouse>/IN/<id>` (auto-increment). **Draft**: supplier, source document, date, destination, product lines (add/remove); responsible is the signed-in user. **To Do** › Ready: enter quantities received (or "Set received = expected"). **Validate** › Done: stock increases and the move is logged. Print (PDF) unlocks once Done. Cancel any time before Done.
5. **Delivery form** — reference `<Warehouse>/OUT/<id>`. **Draft**: customer, address, date, product lines; a line above stock turns red with an alert. **To Do** › Waiting (stock short — automatic, turns Ready when stock arrives) or Ready › Pick › Pack › **Validate** › Done: stock decreases. Print (PDF) once Done.
6. **Internal transfer** — reference `<Warehouse>/INT/<id>`. Draft: From/To locations and product lines, then To Do › Validate. Total stock is unchanged; only the location changes and each line is logged. Waiting when the source location is short.
7. **Inventory adjustment** — product + location → recorded qty, counted qty, auto difference (±, color-coded), reason (Damaged / Lost / Count correction), note, Apply.
8. **Move History** — ledger with date/time, reference, contact, operation, product, from → to, quantity (+ green, − red, ⇄ grey for transfers), status and user; scheduled (not yet done) moves appear without a sign; one row per product line; list ↔ kanban by status; filters for date range, operation, status, product, warehouse and search by reference or contact.
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

## Dashboard Integration

The StockSense dashboard now consumes live inventory and operations data through the backend APIs, including products, receipts, deliveries, internal transfers, warehouses, and locations.

### Backend API Integration
The dashboard is connected to the live backend APIs for inventory and operations data.
