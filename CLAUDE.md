# Meat Vanta — guide for Claude Code

Read this first, then `HANDOFF.md` (what is done / pending) and `DELIVERY-SYSTEM.md` (delivery module reference).
Put this file in the folder that contains the three repos (or copy it into each repo root).

## What this is
E-commerce platform for **Meat Vanta**, a halal meat shop in Gurugram (35+ years in business). Mohit (the owner of this
workspace) is the **solo developer**, building it for a friend who owns the shop. Fresh chicken, mutton, kebabs, paya.

| Part | Repo (GitHub) | Local folder | Stack | Local port |
|---|---|---|---|---|
| Backend API | `M0h1it/meatvanta_backend` | `...\meatvanta\meatvanta-backend` | Node 22, Express 4, Prisma 5, MySQL | 4000 |
| Admin panel | `M0h1it/meatvanta_admin` | `...\meatvanta-admin` | React 18 + Vite + Tailwind | 5173 |
| Customer site | `M0h1it/meatvanta` | `...\meatvanta` | React 18 + Vite + Tailwind | 5174 |

Production: Hostinger VPS (Ubuntu), PM2 process `meatvanta-api`, Nginx, local MySQL 8.4, Cloudflare in front.
`https://meatvanta.com` (customer), `https://admin.meatvanta.com`, `https://api.meatvanta.com`.
Local development database is the old **Aiven** MySQL (a *different* database from production). Both must get migrations.

## How to work with Mohit (important)
- He writes **Hinglish** (Hindi in English letters). Answer in the same style: simple, short, no jargon walls.
- **Explain the approach first and wait for his approval before writing code**, unless he clearly says "do it".
- When you change code: first list the files (grouped **new / modified / deleted**), then give the full content of
  every changed file. Not snippets or diffs. Individual files; a zip only for big multi-file changes.
- He is not always aware of side effects — point out risks (security, data, production) in one or two lines.
- Never claim something works unless you ran it. Say what you could not test.
- Do not reintroduce things he declined (see HANDOFF.md → "Declined").

## Repo structure (feature-based, both sides mirror each other)
Backend `src/`: `controllers/<feature>/`, `routes/<feature>/`, `services/<feature>/`, `validators/<feature>/`,
`middlewares/`, `utils/`, `permissions/permissions.json`, `config/`. Routes are mounted in `src/routes/index.js`
(admin, under `/api/admin/*`) and `src/routes/public/public.routes.js` (customer site, under `/api/public/*`).
Services hold the logic and talk to Prisma; controllers only validate + call + shape the response
(`success(res, status, msg, data)` / `failure(res, status, msg, errors)` in `utils/apiResponse.util.js`).
Expected errors are thrown as `Error` with `statusCode` and `expose = true`; anything else goes to the error handler.
Frontends: `src/features/<feature>/{api,pages,components}`, shared stuff in `components/`, `hooks/`, `lib/`, `context/`.

## Key architecture decisions (do not break)
1. **Two separate auth systems.** Admin = email+password, cookie `shm_admin_token`, `JWT_SECRET`. Customer = phone +
   MSG91 OTP widget, cookies `shm_customer_token` (1h) + `shm_customer_refresh` (30d, rotating, reuse = revoke all),
   `CUSTOMER_JWT_SECRET`. An admin token must never authenticate a customer and vice versa.
2. **Checkout does not require login** (`/api/public/orders` uses optional-auth). COD and Razorpay both work as guest.
3. **RBAC is DB-backed.** `roles.permissions` is a JSON array like `["orders:view","delivery:*"]`; `"*"` = owner.
   `permissions.json` is only the catalog of valid keys (used for the role builder UI and audit-log key checks).
   Check with `requirePermission("x:y")` / `requireAnyPermission(...)`; front end with `usePermission().hasPermission`.
4. **All money is computed on the server** at order time. Never trust prices/discounts from the browser.
5. **Razorpay**: a `PendingCheckout` row holds the priced draft; the `Order` is only created after the payment
   signature is verified (`promotePendingCheckout` in `orders.service.js`). Abandoned payments never appear to the shop.
6. **Delivery rules are admin-configurable** (Delivery Settings page), never hard-coded.
7. Product model: variants = how much (250 GM / 1 KG); option groups = how it's prepared (+ extra price).
8. Orders snapshot names/prices/address/pin so later edits never rewrite history.
9. Dates: the VPS clock is UTC, the shop lives in IST. Use `utils/istDate.util.js` for anything about "today".
   (Known legacy bug: `getAvailableDeliveryDates` still uses server-local time — see HANDOFF.md.)
10. Notifications are shop-wide (`adminUserId = null`) or targeted at one admin (`adminUserId = X`).

## Local development
```
# backend
cd meatvanta-backend
npm install
npx prisma migrate deploy      # NOT `migrate dev` — see pitfalls
npx prisma generate
npm run dev                    # nodemon src/server.js  (PowerShell: `nodemon src/server.js`)
# admin / customer
npm install && npm run dev
```
Local-only OTP bypass (so he can log in on the customer site without an SMS): in backend `.env`
`ALLOW_DEV_LOGIN="true"`, `DEV_LOGIN_PHONES="<his number>"`, `DEV_LOGIN_NAME="Mohit"`; in customer `.env.local`
`VITE_DEV_LOGIN_PHONES="<his number>"`. The backend answers 404 in production, for proxied requests and for any number
not listed. **Never put these in the VPS `.env`.**

## Deployment (VPS)
```
cd <backend>   && git pull --ff-only && npm ci && npx prisma migrate deploy && npx prisma generate \
               && pm2 restart meatvanta-api --update-env
cd <admin>     && git pull --ff-only && npm ci && npm run build
cd <customer>  && git pull --ff-only && npm ci && npm run build
```
- Plain `pm2 restart` does NOT reload `.env`. Always use `--update-env` after touching `.env`.
- After any Prisma schema/migration change, `npx prisma generate` must be re-run or the running client silently lacks the
  new fields (symptom: `Unknown argument ...` errors on create — happened once locally).
- Run `npx prisma validate` before `migrate deploy` (schema was never machine-validated in the sandbox).
- Production `.env` must have `NODE_ENV=production`, `OTP_DEV_MODE=false`, `TRUST_PROXY=2`, no `ALLOW_DEV_LOGIN`.

## Pitfalls we already hit
- `npx prisma migrate dev` fails with a MySQL syntax error because migration `20260830120000_admin_password_reset`
  starts with a UTF-8 BOM. Use `migrate deploy`. **Do not edit that file** (Prisma would report a checksum drift).
- Windows: stop nodemon before `prisma generate` (EPERM on the query engine DLL).
- Express `res.clearCookie` with `maxAge` prints a deprecation warning — harmless.
- Admin rider screen polls every 15 s, board every 30 s; the many `304` lines in the log are normal.
- The sandbox where earlier work was prepared had no network to Prisma binaries: code was syntax-checked and unit-tested
  with mocks, but **never run against a real database**. Test everything on a real DB.

## Testing approach used so far
Plain Node scripts with mocked Prisma (`Module._load` override) for services; `esbuild` to syntax-check JSX files.
There is no test framework in the repo yet. If you add tests, keep them dependency-free or ask Mohit first.
