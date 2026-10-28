# Meat Vanta — HANDOFF (status as of 2026-10-10)

Read `CLAUDE.md` first (how to work with Mohit, architecture, pitfalls), then `DELIVERY-SYSTEM.md` (delivery module reference). This file = what is done, what is declined, what is pending.

## 1. What was done (this stretch of work)

| Phase | What | Delivered as |
|---|---|---|
| Dev-login | Local-only OTP bypass for Mohit's number (`ALLOW_DEV_LOGIN`, `DEV_LOGIN_PHONES`, loopback-only guard). Never enable in production. | individual files |
| Delivery P2 | Map pin on orders (Leaflet/OSM), delivered-by + time + payment info per order, admin "All Deliveries" board with filters | meatvanta-delivery-p2.zip |
| Delivery P3 | Rider cash hand-over tracking (`delivery:settle`, Rider Cash page), failed-delivery owner flow (retry same rider / other rider / cancel) | meatvanta-delivery-p3.zip |
| Delivery P4 | 60–90 min promise copy/checkout/SEO | **DECLINED by Mohit — see §2** |

Mohit says he tested P2 + P3 fully on local. They are NOT yet deployed to production (verify with him).

Migrations added (all three must run on BOTH local DB and production VPS DB — they are separate databases):
1. `delivery_riders`
2. `20261010020000_order_delivery_pin`
3. `20261010030000_cash_settlement_and_failed_delivery`
4. `20261011010000_wallet_and_item_adjustments` — wallet tables + items-not-available columns (additive, backfills
   `order_items.ordered_quantity`). Applied to the local Aiven dev DB on 2026-10-11, NOT yet on production.
   Feature description: DELIVERY-SYSTEM.md → "Items not available + wallet".
5. `20261011020000_wallet_checkout_hold` — 3 columns + index on `pending_checkouts` (wallet hold while a Razorpay
   window is open). Applied to the local dev DB, NOT yet on production. Phase 2 (wallet at checkout) and Phase 3
   (Wallet report page, dashboard "Wallet Owed") are built and tested locally; SMS/WhatsApp customer messages are
   NOT built (need an approved MSG91 template).

## 2. Declined — do NOT reintroduce unless Mohit asks
Phase 4 (60–90 minute delivery promise: checkout changes, shop-closed/cutoff handling, copy on shop/product/FAQ/delivery-info pages, SEO meta, `deliveryPromise.util.js`). Mohit said "ye changes nahi krne". It was reverted in the sandbox.
If he had applied the P4 zip locally: extract `meatvanta-undo-p4.zip` over the project and delete `backend/src/utils/deliveryPromise.util.js`. If not applied, nothing to do.

## 3. Production deploy steps (VPS, when Mohit is ready)
```
cd <repo> && git pull --ff-only
# backend
npm ci
npx prisma migrate deploy      # NOT migrate dev (old migration has a BOM -> shadow DB error)
npx prisma generate
pm2 restart meatvanta-api --update-env
# admin + customer
npm ci && npm run build
```
Then in admin: create a `delivery` role (permissions `delivery:view`, NOT `orders:view`), create a rider AdminUser with a phone number; give the owner role `delivery:settle` (owner `*` already covers it).

## 4. Local test checklist (after pulling anything)
- `npx prisma migrate deploy` + `npx prisma generate` (stop nodemon first on Windows) — otherwise "Unknown argument customerId" style errors.
- Customer: login via dev-login, add address with map pin, checkout COD → order shows map link in admin.
- Admin: order detail shows pin/map, rider assign, delivered-by/time, payment method.
- Rider login: My Deliveries → pickup → delivered (COD) → My cash shows amount.
- Owner: Rider Cash → settle (full + partial); All Deliveries board filters.
- Failed delivery: rider reports problem → owner retries same rider / other rider / cancels (coupon released; paid Razorpay → refundNeeded).

## 5. Known issues / backlog
- `getAvailableDeliveryDates` uses server-local time; VPS is UTC → wrong day around midnight IST (legacy bug, untouched).
- Dashboard vs analytics revenue mismatch.
- Mobile BottomNav is missing some pages.
- Bestseller computed by order date, not delivered.
- Stale R2 code (`config/r2.js`) still in repo.
- `.env.example` quoting / `OTP_DEV_MODE` confusion.
- `prisma validate` never run (sandbox had no network) — run `npx prisma validate` locally.
- Custom roles without `orders:view` see errors on dashboard.
- Out-of-stock product SEO (returns 200 with SPA not-found); name-based product URLs.
- Nothing from P2/P3 was run against a real DB or browser by the previous assistant (only mocked-Prisma Node tests) — Mohit's own local test is the real validation.

Ops/security:
- Re-enable MSG91 IP security (VPS IP 89.116.122.231).
- Refund the Razorpay test payment.
- Rotate exposed secrets.
- Off-server DB backup to R2.
- Retire Vercel / Render / Aiven.

Mohit's own post-deploy tasks: welcome offer ON, shop social links, category photos, product descriptions, Search Console / Bing / Google Business Profile.

## 6. Possible next features (NOT approved — ask Mohit first)
- WhatsApp/SMS customer status messages via MSG91 (needs template approval).
- Rider native app (needs bearer-token auth instead of cookie).
- Partner delivery (Borzo etc.).
- Fix the delivery-date UTC bug.
Always propose, wait for his go-ahead, and deliver changes as small, testable steps.
