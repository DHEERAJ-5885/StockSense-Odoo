# Sign-in setup (Supabase + backend)

Sign-in and sign-up talk to Supabase Auth directly from the browser. **Forgot password** goes through the
StockSense backend (`backend/`), which emails a 6-digit code with **Nodemailer** and then sets the new
password. Stock data (products, receipts, …) is still held in the browser for now.

## 1. Database (Supabase SQL Editor, run once each — both are safe to re-run)

- `Database/migrations/003_frontend_auth.sql` — saves the Login ID and role from the sign-up form, adds the
  Login-ID lookups the sign-in page needs before someone is signed in, and blocks users from promoting their own role.
- `Database/migrations/004_user_id_for_email.sql` — lets the backend find a user by email (service-role key only).

Users created before 003 have no Login ID — they can sign in with their **email**.

## 2. Supabase settings (Authentication)

- **Providers → Email → Confirm email: OFF** — sign-up goes straight to the dashboard. (If it is ON, sign-up shows
  "Check your email" and the user must click the link first. Both work.)
- **URL Configuration → Redirect URLs:** add the address you open the app on (for example `http://localhost:8000/**`).
- The email template does **not** need editing: the reset code is sent by the backend, not by Supabase.

## 3. Backend (sends the reset code)

```bash
cd backend
npm install
cp .env.example .env      # then fill it in
npm start                 # http://localhost:5000
```

`backend/.env`:

| Key | What |
|---|---|
| `SUPABASE_URL` | your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` (server only, never in the browser) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | your email account (Nodemailer) |

**Gmail:** turn on 2-step verification, create an *App Password* at <https://myaccount.google.com/apppasswords>, then use
`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=you@gmail.com`, `SMTP_PASS=<app password>`,
`MAIL_FROM=StockSense <you@gmail.com>`.

While `SMTP_HOST` is empty the backend runs in **console mode**: no email is sent, and the message (with the code)
is printed in the backend terminal — enough for development.

The browser finds the backend through `API_URL` in `config.js` (default `http://localhost:5000`).

Tests (no network, no real email): `cd backend && npm test`.

## Notes

- `config.js` holds the project URL and the **anon** key, which are meant to be public. The `service_role` key lives
  only in `backend/.env` (git-ignored).
- Sign-up is open and any signed-in user can currently read/write every table (see `Database/README.md`).
  Tighten the row-level-security policies against `profiles.role` before real use.
- Use `Auth.dc.html?local=1` to run without Supabase (users stored in the browser, demo reset code `482913`).
