# Meat Vanta Orders — Android order-alert app

Read this whole file before doing anything. It is the single source of truth for this app.

---

## 1. How to work with me (Mohit) — non-negotiable

1. **Explain the approach first and wait for my explicit approval before writing or editing any code.** Every time, even for small changes.
2. Before code, **list the files** grouped as **New / Modified / Deleted**, with one line on why each changes.
3. Make changes only to the approved files. If something new turns up mid-task (an extra file, a dependency, a native change), stop and ask.
4. Never commit, push, run migrations against production, or touch the VPS unless I ask for that specific step.
5. Never put secrets in the repo: `google-services.json`, keystore files, keystore passwords, Firebase service-account JSON, `.env`.
6. When a command fails (Gradle, Metro, Prisma), read the full error, explain the cause in one or two lines, propose the fix, then wait.
7. Keep it simple. This is a small shop with low order volume. No over-engineering.

---

## 2. What we are building

A **native Android app (React Native CLI, no Expo)** for the shop owner/staff of **Meat Vanta**, a halal meat shop in Gurugram.

The app does one job:
- When a new customer order arrives, the phone **plays a siren that keeps ringing until someone taps "Acknowledge"** — even when the phone is locked, the screen is off, or the app is closed/killed.
- A notification appears in the Android notification shade with the order details.
- Staff can see incoming orders, open details, call the customer, open the address in Maps, and **change order status**.

**Android only.** iPhone is out of scope (no Apple Developer account). Do not add iOS-specific work.

---

## 3. The wider system (context)

Meat Vanta has three existing codebases, all live in production:

| Repo | Stack | Prod URL |
|---|---|---|
| `M0h1it/meatvanta_backend` | Node / Express / Prisma / MySQL 8.4 | https://api.meatvanta.com |
| `M0h1it/meatvanta_admin` | React + Vite (admin panel) | https://admin.meatvanta.com |
| `M0h1it/meatvanta` | React + Vite (customer site) | https://meatvanta.com |

- Hosting: single Hostinger VPS (Ubuntu). Backend runs under PM2 as `meatvanta-api` on port 4000 behind Nginx. Cloudflare in front of all domains.
- Backend structure is **feature-based**: `controllers/<feature>/`, `routes/<feature>/`, `services/<feature>/`, `validators/<feature>/`. Follow it.
- **Two separate auth systems already exist**: admin (email + password, cookie JWT) and customer (phone OTP, different secret + cookie). An admin token must never authenticate a customer. The app adds a third, separate token type (see §6).
- **RBAC is DB-backed**: roles table with a `permissions` JSON array; `permissions.json` is only the catalog of valid keys. Custom roles are made in the admin UI (role builder).
- Order status flow (customer-facing): `placed → preparing → out_for_delivery → delivered`, or `cancelled`. Reuse the existing status-transition rules in `orders.service.js` — do not reimplement them.
- Orders become visible at two points only:
  - **COD**: when the order is created.
  - **Razorpay**: when `promotePendingCheckout` (in `orders.service.js`) succeeds after signature verification. Abandoned Razorpay checkouts never become orders — they must never trigger the siren.
- Existing admin-panel notifications (bell + sound + polling) stay unchanged.

---

## 4. Final decisions

| Item | Decision |
|---|---|
| Platform | Android only. APK installed directly (no Play Store). |
| App tech | React Native **CLI** (bare). No Expo, no EAS. |
| Push | **Firebase Cloud Messaging, called directly** from the backend via `firebase-admin`. No Expo push service. |
| Siren | Notifee notification with **looping sound**, full-screen alert, ongoing (not swipeable). Rings until Acknowledge. |
| Who can use the app | Admin users whose role has the new permission **`device:access`**. |
| Login | Same admin email + password. App gets its own long-lived bearer token (§6). |
| Acknowledge | Separate "Seen it" step. Stops the siren on **all** phones. Does **not** change status. |
| Status change | Allowed from the app, but **also** requires the existing order-status permission key (check the exact key name in `permissions.json`). |
| Backup re-ring | If nobody acknowledges: backend re-sends the push every **2 min**, for up to **15 min** after order creation. After that, stop and flag the order as overdue-unacknowledged in the app. |
| Dev account names | Firebase project: "Meat Vanta". Android package: **`com.meatvanta.orders`**. App name: "Meat Vanta Orders". |

---

## 5. Backend changes (`meatvanta_backend`)

Read the real files first (`prisma/schema.prisma`, `permissions.json`, `orders.service.js`, the admin auth middleware, the route index, `server.js`/`app.js`) and match their actual paths and style. The plan below is the intent; exact paths may differ.

### 5.1 Database (additive migration only — never drop/rename existing columns)

```prisma
model AppDevice {
  id          Int        @id @default(autoincrement())
  adminUserId Int
  adminUser   AdminUser  @relation(fields: [adminUserId], references: [id])
  tokenHash   String     @unique @db.VarChar(64)   // sha256 of the bearer token
  fcmToken    String?    @db.VarChar(512)
  deviceName  String?    @db.VarChar(120)
  lastSeenAt  DateTime?
  revokedAt   DateTime?
  createdAt   DateTime   @default(now())
  @@index([adminUserId])
  @@map("app_devices")
}

// Order — add:
//   acknowledgedAt    DateTime?
//   acknowledgedById  Int?        (FK → AdminUser)
//   lastAlertSentAt   DateTime?   (for the re-ring job)
```

Match the existing ID type and naming conventions in `schema.prisma` (Int vs String ids, `@@map` style). Adjust the snippet above to fit.

### 5.2 Permission
- Add `device:access` to `permissions.json` (with a label/description in the same format as the others).
- Status change in the app uses the **existing** order-status key — do not create a new one.

### 5.3 App auth (separate from admin cookie auth)
- `POST /api/app/auth/login` `{ email, password, deviceName, fcmToken? }`
  - Verify credentials with the existing admin password logic.
  - Reject if the user is inactive or their role lacks `device:access` → 403 "This account is not allowed to use the app."
  - Generate a random token (`crypto.randomBytes(32)` hex). Store **only its sha256** in `AppDevice.tokenHash`. Return the plain token once.
  - Response: `{ token, user: { id, name, email, permissions } }`.
  - Reuse the existing login rate limiter.
- `POST /api/app/auth/logout` → set `revokedAt`, clear `fcmToken`.
- `GET /api/app/auth/me` → current user + permissions.
- Middleware `appAuth`:
  - Reads `Authorization: Bearer <token>` **only** (never cookies).
  - Looks up by hash; rejects if missing, revoked, user inactive, or role no longer has `device:access`. Permission is re-checked on **every** request so removing it from the role locks the app immediately.
  - Expires devices inactive for 90 days.
  - Updates `lastSeenAt` at most once every few minutes (avoid a write per request).
- App tokens must not work on `/api/admin/*`, and admin cookies must not work on `/api/app/*`.

### 5.4 App API (all behind `appAuth`)
| Method | Path | Notes |
|---|---|---|
| PUT | `/api/app/devices/fcm-token` | `{ fcmToken }` — called after login and on token refresh |
| GET | `/api/app/orders?tab=new\|active\|today` | `new` = unacknowledged; `active` = not delivered/cancelled; `today` = created today (IST) |
| GET | `/api/app/orders/:id` | Items (variant + options), totals, payment method/status, customer name + phone, address + lat/lng if present, delivery date, notes, acknowledged info |
| POST | `/api/app/orders/:id/acknowledge` | Idempotent. Sets `acknowledgedAt/ById`, sends stop push to all devices, writes audit log |
| PATCH | `/api/app/orders/:id/status` | `{ status }`. Needs the order-status permission. Calls the existing service function so transitions/validation stay identical. Audit log |

Return only the fields the app needs. Use the existing validator style.

### 5.5 Push services
- `services/push/fcm.service.js`
  - Init `firebase-admin` from `FIREBASE_SERVICE_ACCOUNT_PATH` (absolute path on the VPS, outside the repo). If missing, log a warning and no-op — never crash the API.
  - `sendToTokens(tokens, data)` using `sendEachForMulticast`. Remove (`fcmToken = null`) tokens that fail with `registration-token-not-registered` / `invalid-argument`.
- `services/push/orderAlerts.service.js`
  - `notifyNewOrder(order)` — called right after a COD order is created and right after `promotePendingCheckout` succeeds. **Fire-and-forget** (`.catch(log)`); a push failure must never fail or slow the order.
  - `notifyAcknowledged(orderId)` — stop message.
  - `startReRingJob()` — `setInterval` every 60s: find orders with `acknowledgedAt = null`, status not cancelled, created within the last 15 min, and `lastAlertSentAt` older than 2 min → resend, update `lastAlertSentAt`. Single PM2 instance, so an in-process interval is fine.
- Recipients: tokens from non-revoked `AppDevice` rows whose user is active and whose role has `device:access`.

### 5.6 FCM message format (data-only, high priority)
Data-only so the app's background handler always runs and Notifee draws the alarm. **All data values must be strings.**

```js
{
  tokens,
  android: { priority: 'high', ttl: 15 * 60 * 1000 },
  data: {
    type: 'new_order',          // or 'order_ack'
    orderId: '1042',
    orderNumber: 'MV-1042',
    total: '860',
    paymentMethod: 'COD',       // or 'RAZORPAY'
    customerName: 'Rahul',
    area: 'Sector 45',
    itemsSummary: 'Chicken Curry Cut 1 KG, Mutton Keema 500 GM',
    createdAt: '2026-10-28T04:40:00.000Z'
  }
}
```
For `order_ack`, send only `type` and `orderId`.

### 5.7 Config
- `.env`: `FIREBASE_SERVICE_ACCOUNT_PATH=/home/<user>/secrets/firebase-sa.json`
- Add to `.env.example` (no real value).
- `package.json`: add `firebase-admin`.

---

## 6. App (this repo — `MeatVantaOrders`)

### 6.1 Libraries
- `@react-native-firebase/app`, `@react-native-firebase/messaging`
- `@notifee/react-native`
- `@react-navigation/native`, `@react-navigation/native-stack`, `react-native-screens`, `react-native-safe-area-context`
- `react-native-keychain` (secure token storage)
- `axios`

Before installing, **check that the versions are compatible with the installed React Native version and the New Architecture**. If a library breaks under the New Architecture, tell me and propose `newArchEnabled=false` in `android/gradle.properties` as the fallback — don't silently switch it.

### 6.2 Structure
```
index.js                     # registers FCM background handler + Notifee onBackgroundEvent BEFORE AppRegistry
App.js                       # navigation, auth gate
src/
  config.js                  # API_BASE_URL (prod: https://api.meatvanta.com/api/app)
  api/client.js              # axios instance, attaches Bearer token, 401 → logout
  api/endpoints.js           # login, logout, me, fcmToken, orders, order, acknowledge, status
  auth/storage.js            # keychain get/set/clear token
  auth/AuthContext.js
  notifications/channel.js   # create siren channel
  notifications/alarm.js     # showOrderAlarm(data), stopOrderAlarm(orderId)
  notifications/handlers.js  # foreground onMessage, background handler, Notifee events
  notifications/fcm.js       # permission, getToken, onTokenRefresh → PUT
  screens/LoginScreen.js
  screens/OrdersScreen.js    # tabs: New / Active / Today, pull to refresh, overdue highlight
  screens/OrderDetailScreen.js
  screens/SetupScreen.js     # permissions + battery checklist
android/app/src/main/res/raw/siren.mp3
```

### 6.3 Notification behaviour (the core of the app)
- **Channel** (create on app start and inside the background handler before displaying):
  - id `orders_siren_v1`, importance HIGH, sound `siren` (file `res/raw/siren.mp3`, referenced without extension), vibration on, lock-screen visibility PUBLIC.
  - Android channels are immutable once created. To change the sound later, create a **new channel id** (`orders_siren_v2`), never edit the old one.
- **On `new_order`** (foreground `onMessage` and background `setBackgroundMessageHandler` both call the same `showOrderAlarm`):
  - Notification id `order-<orderId>` so re-rings replace instead of stacking.
  - Title: `New order #<orderNumber> · ₹<total>`. Body: `<paymentMethod> · <customerName> · <area>`; big text includes `itemsSummary`.
  - Android options: `channelId`, `category: AndroidCategory.ALARM`, `loopSound: true`, `ongoing: true`, `autoCancel: false`, `importance: HIGH`, `fullScreenAction` (launch the app on the order), `pressAction` default (open order detail), action button **"Acknowledge"** with `pressAction.id = 'ack'`.
- **Acknowledge** — from the in-app button or the notification action (handled in `notifee.onBackgroundEvent` / `onForegroundEvent` for `pressAction.id === 'ack'`):
  1. Read token from keychain.
  2. `POST /orders/:id/acknowledge`.
  3. `notifee.cancelNotification('order-<id>')`.
  - If the API call fails, still stop the local sound, keep the order marked unacknowledged in the list, and retry on next app open.
- **On `order_ack`**: cancel `order-<orderId>` (stops the siren on other phones).
- Background handlers have no UI. They must not depend on React state or context — only keychain + axios.
- Opening the app should also refresh the list, so nothing depends on push alone.

### 6.4 First-run Setup screen (required for reliability)
Show a checklist with status and a button for each item. Re-check on every app resume:
1. Notification permission (Android 13+ `POST_NOTIFICATIONS`) — `notifee.requestPermission()`.
2. Full-screen alerts (Android 14+) — open settings with `Linking.sendIntent('android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT', …)` if not granted.
3. Battery optimisation off — `notifee.isBatteryOptimizationEnabled()` / `openBatteryOptimizationSettings()`.
4. OEM power manager (Xiaomi, Realme, Oppo, Vivo, Samsung) — `notifee.getPowerManagerInfo()` / `openPowerManagerSettings()`, plus a plain-language hint ("Set battery to No restrictions / allow autostart").
5. A **"Test siren"** button that shows a local test alarm.

### 6.5 Native config to change
- `android/build.gradle` — add the Google services classpath (version per RNFirebase docs for the installed version).
- `android/app/build.gradle` — apply `com.google.gms.google-services`; release `signingConfigs` reading `MYAPP_UPLOAD_*` properties; release build uses it.
- `android/app/src/main/AndroidManifest.xml` permissions:
  `POST_NOTIFICATIONS`, `USE_FULL_SCREEN_INTENT`, `WAKE_LOCK`, `VIBRATE`, `RECEIVE_BOOT_COMPLETED`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, `INTERNET`.
  The main activity needs `showWhenLocked` / `turnScreenOn` behaviour for the full-screen alert. Check Notifee docs for what it already handles.
- `android/gradle.properties` — `MYAPP_UPLOAD_STORE_FILE`, `MYAPP_UPLOAD_KEY_ALIAS`. **Passwords go in `~/.gradle/gradle.properties` on my PC, never in the repo.**
- `android/app/google-services.json` — provided by me, git-ignored.
- `.gitignore` — add `*.keystore`, `*.jks`, `google-services.json`.
- Cleartext HTTP is allowed only in debug (for local backend testing). Release uses HTTPS only.

### 6.6 UI
- Mobile-first, big touch targets. Shop staff use it with busy hands.
- Brand colours: brand `#B4141F`, brand-dark `#8C0F18`, accent `#C8952B`, surface `#FDF9F3`, ink `#1A1A1A`.
- Unacknowledged orders are visually loud (crimson). Overdue-unacknowledged (> 15 min) gets an extra flag.
- Prices in ₹, times in IST.

---

## 7. Setup, build and release (my PC)

**Prerequisites:** JDK 17, Android Studio (SDK Platform 35, Build-Tools, Platform-Tools), `ANDROID_HOME` and `JAVA_HOME` set.

**Create the project:**
```
npx @react-native-community/cli init MeatVantaOrders --package-name com.meatvanta.orders
```

**Run in debug:** phone on USB with debugging on.
```
npx react-native run-android
```

**Keystore (one time — back it up; losing it means the app can't be updated over the old install):**
```
keytool -genkeypair -v -storetype PKCS12 -keystore meatvanta-orders.keystore -alias meatvanta-orders -keyalg RSA -keysize 2048 -validity 10000
```
Place it in `android/app/`.

**Release APK:**
```
cd android && ./gradlew assembleRelease
```
Output: `android/app/build/outputs/apk/release/app-release.apk`. Install it on the shop phone.

---

## 8. Backend deploy steps (when I ask)

On the VPS, in `meatvanta_backend`:
1. `git pull --ff-only`
2. `npm ci`
3. `npx prisma validate`
4. `npx prisma migrate deploy`
5. `npx prisma generate` — always; otherwise the deployed client silently lacks the new model.
6. Put the service-account JSON at the path in `FIREBASE_SERVICE_ACCOUNT_PATH`. Set file permissions to 600.
7. `pm2 restart meatvanta-api --update-env` — plain `pm2 restart` does **not** reload `.env`.
8. In the admin panel, add `device:access` to the owner's role (or create a "Shop Orders" role).

---

## 9. Order of work

1. **Backend**: migration → permission → app auth → app order APIs → push services → hooks in `orders.service.js` → re-ring job. Test with Postman and a real FCM token.
2. **App**: login + orders list + detail → FCM token registration → siren channel + alarm → acknowledge (in-app and from notification) → status change → Setup screen.
3. **End-to-end test** (checklist below).
4. **Release APK** and install on the shop phone.

## 10. Test checklist (all must pass before release)
- [ ] COD order → phone rings within seconds with the **app open**.
- [ ] Same with the app in the **background**.
- [ ] Same with the app **swiped away/killed**.
- [ ] Same with the **phone locked, screen off, idle 30+ min**.
- [ ] Razorpay order rings **only after** successful payment; an abandoned Razorpay checkout never rings.
- [ ] Siren keeps looping until Acknowledge.
- [ ] Acknowledge from the notification button works with the app killed.
- [ ] Acknowledge on phone A stops the siren on phone B.
- [ ] No acknowledge → re-ring every 2 min, stops after 15 min, order flagged.
- [ ] Status change works; blocked when the role lacks the order-status permission.
- [ ] Removing `device:access` from the role → app logs out on next request and stops receiving pushes.
- [ ] Logout → that phone stops receiving pushes.
- [ ] App token rejected on `/api/admin/*`; admin cookie rejected on `/api/app/*`.
- [ ] Backend with Firebase misconfigured → orders still succeed, warning logged.

## 11. Known limitations (v1)
- Notification sound follows the phone's ringer mode. If the phone is on **silent/DND**, the siren may not be audible. Ringing through silent (alarm audio stream or DND bypass) is a later decision — ask before adding it.
- Some OEM phones delay or kill background work unless battery is set to "No restrictions". The Setup screen exists for this.
- iPhone not supported.

## 12. Out of scope (don't build unless I ask)
iOS, Play Store publishing, rider/delivery features, analytics, chat, in-app order creation, editing order items or prices.