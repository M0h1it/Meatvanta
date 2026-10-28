# Delivery system — technical reference (as built, 2026-10-10)

Owner's situation: low order volume, **one own rider**, mostly one direction. No partner delivery app yet (later).
The rider logs in to the **same admin panel** with a role that has delivery permissions. A separate rider app comes later.

## Concepts
- **Rider** = an `AdminUser` whose role contains `delivery:view` or `delivery:*` explicitly (not via `"*"`).
  Created through Roles → role with delivery permissions, then Admin Users → user with that role (+ phone).
- A rider must **not** have `orders:view` (that would show the whole shop). Owner/manager use `orders:*`/`delivery:*`.
- Order status (customer-facing) stays: `placed → preparing → out_for_delivery → delivered | cancelled`.
  Delivery data is stored on the `Order` row itself (no separate Delivery table yet).

## Permissions (`permissions.json` → `delivery`)
`delivery:view` (rider sees own orders) · `delivery:updateStatus` (pick up / delivered / failed) ·
`delivery:assign` (assign/reassign rider, retry failed) · `delivery:settle` (mark rider cash received).
Seed gives `manager` the `delivery:*` wildcard. Custom roles must tick them explicitly.

## Order columns added for delivery (all nullable/defaulted)
`deliveryAdminId` (FK AdminUser, relation `OrderDelivery`), `deliveryPersonName`, `deliveryPersonPhone` (snapshots),
`deliveryAssignedAt`, `pickedUpAt`, `deliveredAt`, `deliveryFailedReason`, `deliveryFailedAt`, `deliveryAttempts`,
`deliveryLatitude`/`deliveryLongitude` (map-pin snapshot, from the customer's saved address),
`cashSettledAt`, `cashSettledByName`. Notification gets `adminUserId` (targeted notifications).
Migrations: `20261010010000_delivery_riders`, `20261010020000_order_delivery_pin`,
`20261010030000_cash_settlement_and_failed_delivery` (this one backfills old delivered COD orders as already settled).

## API (`/api/admin/delivery/*`, file `routes/delivery/delivery.routes.js`)
| Method + path | Permission | Purpose |
|---|---|---|
| GET `/riders` | `delivery:assign` or `orders:updateStatus` | rider dropdown |
| GET `/my-orders` | `delivery:view` | rider's own active + last-24h delivered orders (limited fields, `riderView`) |
| GET `/my-cash` | `delivery:view` | cash the rider holds |
| POST `/my-orders/:id/pickup` | `delivery:updateStatus` | preparing → out_for_delivery |
| POST `/my-orders/:id/delivered` | `delivery:updateStatus` | → delivered; COD becomes paid, `paymentVerifiedAt` = cash time |
| POST `/my-orders/:id/failed` | `delivery:updateStatus` | `{reason}`; stamps failure, +1 attempt, shop-wide notification |
| POST `/orders/:id/retry` | `delivery:assign` or `orders:updateStatus` | after a failure: `{riderId?}` same rider = try again; other rider = back to `preparing` |
| POST `/orders/:id/cancel-failed` | `orders:cancel` | cancel a failed delivery (releases coupon; returns `refundNeeded` for paid Razorpay orders) |
| GET `/cash` | `delivery:settle` | per-rider cash held + recently settled |
| POST `/cash/settle` | `delivery:settle` | `{riderId, orderIds?}` mark cash received |
Related: `PATCH /api/admin/orders/:id/delivery-person` accepts `{deliveryAdminId}` (new) or `{deliveryPersonName}` (legacy);
`GET /api/admin/orders` filters: `status` (`active` or comma list), `riderId` (`none` or id), `paymentMethod`,
`paymentStatus`, `from`/`to` (IST dates on order date), `search`, `page`, `pageSize` (max 200).
`GET /orders/stats/summary` now requires `orders:view`.

## Rules implemented
- Ownership: a rider can only act on orders where `deliveryAdminId` = their id; others look like "not found".
- `computeDueBy(order)`: same-day/no-date order → createdAt + `DELIVERY_PROMISE_MAX_MINUTES` (default 90);
  a booking for a later day → end of that day's delivery window. Shown as "Due by" and overdue highlight.
- Outstanding cash = COD + paid + delivered + has rider + `cashSettledAt` null. Settling can be partial (`orderIds`).
- Targeted notifications: admins with `orders:view` see shop-wide + their own; others only their own.
- Map link (`utils/mapLink.util.js`): customer's exact pin when the order has one, else a Google Maps search of the address.
  The customer address form now has a Leaflet/OpenStreetMap pin picker (loaded on demand from unpkg); checkout sends the
  pin only while the address text is still the saved one.

## Admin screens (`admin/src/features/delivery/`)
- `MyDeliveriesPage` (`/my-deliveries`) — rider home: due-by timers, Call, Map, collect-cash banner, Picked up /
  Delivered / Could not deliver, "cash with you" banner. Riders are redirected here from `/`.
- `DeliveryBoardPage` (`/delivery-board`, `orders:view`) — every order with filters, map link, rider, times, payment.
- `RiderCashPage` (`/rider-cash`, `delivery:settle`) — who holds how much cash, tick orders, "Received".
- `lib/pickRider.js` — SweetAlert rider chooser. Order detail page shows timeline, payment line, failed-delivery actions.
Customer: `MyOrderDetailPage` shows rider (call link while out for delivery), delivered time and payment line.

## Items not available + wallet (Phase 1, built 2026-10-11)
Client rule: an item can run out after the order is placed. The shop sends the rest, the customer sees what is missing,
and only pays for what is delivered. Paid money for a missing item goes to the customer's **wallet** (no cash-out, no
refund to the bank). Coupons are left exactly as they were (the discount is NOT recomputed).

- **Money.** `orders.subtotal`, `discount`, `deliveryCharge` stay as at checkout. `orders.total` is always what the customer
  pays now: `total = max(0, subtotal - unavailableAmount + deliveryCharge - discount)`. Because every report, the rider
  cash and the customer pages already read `total`, nothing else had to change.
  `orders.unavailableAmount` = value of dropped items, `orders.walletCredited` = given back so far, `orders.walletUsed`
  = paid from the wallet at checkout (Phase 2, 0 for now). `order_items.orderedQuantity` = what was asked for,
  `quantity` = what will be sent (`lineTotal` follows `quantity`).
- **Credit rule.** `paidSoFar` = online-paid ? `total + walletCredited` : `walletUsed`. Credit now =
  `max(0, paidSoFar - newTotal) - walletCredited`. COD (nothing paid yet): the total just drops, wallet 0.
  Everything dropped, or any cancel (admin cancel, failed-delivery cancel): order cancelled and the whole `paidSoFar`
  goes to the wallet, delivery charge included. The old manual "refund from the Razorpay dashboard" is gone
  (`refundNeeded` is only true when the order's phone number cannot hold a wallet).
- **Wallet.** `wallet_accounts` (one per phone, last 10 digits) + `wallet_transactions` (ledger with `balanceAfter`).
  Keyed by phone so a guest's credit is waiting when they sign in with the same number. Spending at checkout: see
  "Wallet at checkout" below. Credits go to the signed-in customer's account phone (`wallet.walletPhoneFor`), else the
  phone on the order.
- **Who/when.** Permission `orders:adjustItems` (owner `*` and manager `orders:*` have it, staff does not). Only while the
  order is `placed` or `preparing`. Partial quantity allowed. One transaction: items + order totals + wallet + coupon release.
- **API.** `POST /api/admin/orders/:id/unavailable` `{ items: [{ itemId, availableQuantity }] }`;
  customer `GET /api/public/auth/wallet` (session phone only); admin customer detail now has `wallet`.
- **Screens.** Admin order detail: "Item not available?" dialog with a live preview of the new total and credit.
  Rider: unavailable lines marked "Not available - do not take", `amountToCollect` already reduced, targeted
  notification. Customer: order page shows "Only 2 of 3 available", "Items not available -₹X", wallet line; Account page
  has the wallet balance + history; two new FAQ entries.
- **Rider role permissions** (correction to older notes): a rider needs `delivery:view` and `delivery:updateStatus`, plus
  `notifications:view` / `notifications:update` to get the bell. Do NOT tick the whole `delivery:*` module - that includes
  `delivery:settle` and `delivery:assign`.
- **Known limits.** Orders placed as a guest do not show in "My Orders" after signing in (orders are linked by
  `customerId`), although their wallet credit does.

## Wallet at checkout (Phase 2, built 2026-10-11)
- **Who.** Only a signed-in customer (`useWallet: true` on `POST /api/public/orders`; a guest gets 400 "Sign in to use your
  wallet"). The wallet used is the account's own phone, never the phone typed on the order. The server decides how much:
  `min(balance, total)`; the browser only says "use it".
- **Fully covered.** No Razorpay, no cash. Flat-charge mode: `paymentMethod = "wallet"`, paid. Manual-charge mode: stays
  `cod` with `walletUsed = items total`, so the delivery charge set later is the only cash due.
- **Partly covered + COD.** `walletUsed = x`, rider collects `total - walletUsed` (`cashDue` in delivery.service). Wallet
  money is debited in the same transaction as the order (conditional `UPDATE ... WHERE balance >= x`, so a parallel
  checkout fails with a clean 409 and creates no order; deadlocks are retried, `retryOnConflict`).
- **Partly covered + Razorpay.** Razorpay is asked for `total - wallet` (never below Rs.1). The wallet part is **held**
  (`balance -> held`, `pending_checkouts.wallet_state = held`). Payment verified -> `captured` (becomes `walletUsed`).
  Never paid -> after 20 min `releaseExpiredHolds` (every 5 min from `server.js`, and whenever a wallet is read) flips
  it `released` and gives the money back. Each row changes state by one conditional update, so it can never be both.
- **Late payment.** Payment arrives after the hold was released: the wallet part is taken again from the balance. If the
  balance is gone, the order is still created (the online part is paid) but as `cod / unpaid` with
  `walletUsed = amount paid online`, a `paymentNote`, and a shop-wide `wallet_shortfall` notification: the rider collects
  the missing part in cash. (`walletUsed` then means "paid up front".)
- **Cancel / item not available.** Same rules as Phase 1; money goes back to the wallet (`paidSoFar` knows about
  `walletUsed`). Wallet-paid orders never appear in Rider Cash.
- **Screens.** Checkout: "Use Meat Vanta wallet" tick (signed-in, balance > 0), "Sign in to use wallet" link for guests,
  payment options hidden when the wallet covers everything, "Paid from wallet / To pay" lines, button label. Order pages
  and admin order detail show the wallet part; the label `wallet` is known to analytics and the delivery board.

## Wallet reports (Phase 3, built 2026-10-11)
- Admin **Wallet** page (`/wallet`, permission `reports:view`): total owed (balances + money reserved), customers with a
  balance, credited / spent this month (IST), balances list (search by phone, "include zero balances"), latest movements.
  API: `GET /api/admin/wallet/summary`, `GET /api/admin/wallet/accounts`.
- Dashboard card "Wallet Owed" (`walletLiability` in `/orders/stats/summary`).
- Customer detail in admin shows the ledger including hold / release rows.
- **Not built:** SMS / WhatsApp status messages to customers. They need an approved MSG91 template (DLT) and its id; the
  existing `sms.util.js` only sends OTPs.

## Not built yet (deliberately deferred)
Partner delivery (Borzo/Porter/Shadowfax adapters, webhooks), auto-routing/zones, batching of multi-direction orders,
native rider app (needs bearer-token auth — admin auth is cookie-only today), WhatsApp/SMS status messages to customers,
cash hand-over reminders, rider performance reports.
