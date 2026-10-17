const prisma = require("../../config/db");

/**
 * Store credit ("Meat Vanta wallet"), keyed by phone number (last 10 digits).
 *
 * Money only ever comes IN from something the customer already paid for - an item
 * the shop could not send, or a cancelled order. There is no top-up and no payout.
 * Every change writes a WalletTransaction row next to the balance, so the balance
 * can always be explained from the history.
 *
 * Spending: a checkout takes money out with `debit` (cash on delivery / wallet only)
 * or, while a Razorpay window is open, `hold` -> `captureHold` (payment verified) or
 * `releaseHold` (customer never paid). All of them are single conditional UPDATEs
 * (balance >= amount), so two checkouts at the same moment can never spend the same rupee.
 */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// How long money stays reserved for a Razorpay window that was never paid.
const HOLD_TTL_MS = 20 * 60 * 1000;

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

/** "+91 98765 43210" and "9876543210" are the same wallet. */
function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "").slice(-10);
}

function isValidPhone(phone) {
  return normalizePhone(phone).length === 10;
}

function requirePhone(phone) {
  const key = normalizePhone(phone);
  if (key.length !== 10) {
    throw httpError(422, "This phone number is not a valid 10-digit number, so a wallet cannot be used.");
  }
  return key;
}

async function writeLedger(tx, account, { type, amount, orderId = null, orderNumber = null, reason, adminId = null }) {
  return tx.walletTransaction.create({
    data: {
      accountId: account.id,
      type,
      amount,
      balanceAfter: account.balance,
      orderId,
      orderNumber,
      reason: String(reason || type).slice(0, 255),
      createdByAdminId: adminId,
    },
  });
}

/**
 * Adds money to a wallet. Must run inside a transaction (`tx`) so the credit
 * lands together with whatever caused it (the order change) - or not at all.
 * Returns null for a zero amount.
 */
async function credit(tx, { phone, amount, orderId = null, orderNumber = null, reason, adminId = null }) {
  const value = round2(amount);
  if (!(value > 0)) return null;
  const key = requirePhone(phone);

  // skipDuplicates = INSERT IGNORE: two credits for a brand-new number at the same time
  // cannot collide on the unique phone; the increment below is atomic either way.
  await tx.walletAccount.createMany({ data: [{ phone: key }], skipDuplicates: true });
  const account = await tx.walletAccount.update({
    where: { phone: key },
    data: { balance: { increment: value } },
  });
  const transaction = await writeLedger(tx, account, { type: "credit", amount: value, orderId, orderNumber, reason, adminId });
  return { account, transaction };
}

/**
 * Takes money out of the spendable balance. Throws 409 when the balance is not enough
 * (someone - possibly another checkout of the same customer - got there first).
 */
async function debit(tx, { phone, amount, orderId = null, orderNumber = null, reason }) {
  const value = round2(amount);
  if (!(value > 0)) return null;
  const key = requirePhone(phone);

  const moved = await tx.walletAccount.updateMany({
    where: { phone: key, balance: { gte: value } },
    data: { balance: { decrement: value } },
  });
  if (moved.count === 0) {
    throw httpError(409, "Your wallet balance has changed and is not enough for this order. Please check the amount and try again.");
  }
  const account = await tx.walletAccount.findUnique({ where: { phone: key } });
  await writeLedger(tx, account, { type: "debit", amount: value, orderId, orderNumber, reason: reason || "Used on an order" });
  return account;
}

/** Like debit, but answers true/false instead of throwing (used on a late payment). */
async function tryDebit(tx, args) {
  try {
    await debit(tx, args);
    return true;
  } catch (err) {
    if (err.statusCode === 409) return false;
    throw err;
  }
}

/** Reserves money for an open Razorpay window: balance -> held. Throws 409 when not enough. */
async function hold(tx, { phone, amount, reason }) {
  const value = round2(amount);
  if (!(value > 0)) return null;
  const key = requirePhone(phone);

  const moved = await tx.walletAccount.updateMany({
    where: { phone: key, balance: { gte: value } },
    data: { balance: { decrement: value }, held: { increment: value } },
  });
  if (moved.count === 0) {
    throw httpError(409, "Your wallet balance has changed and is not enough for this order. Please check the amount and try again.");
  }
  const account = await tx.walletAccount.findUnique({ where: { phone: key } });
  await writeLedger(tx, account, { type: "hold", amount: value, reason: reason || "Reserved for an online payment" });
  return account;
}

/** The payment came through: reserved money is now spent. false when the hold is not there any more. */
async function captureHold(tx, { phone, amount, orderId = null, orderNumber = null, reason }) {
  const value = round2(amount);
  if (!(value > 0)) return true;
  const key = requirePhone(phone);

  const moved = await tx.walletAccount.updateMany({
    where: { phone: key, held: { gte: value } },
    data: { held: { decrement: value } },
  });
  if (moved.count === 0) return false;
  const account = await tx.walletAccount.findUnique({ where: { phone: key } });
  await writeLedger(tx, account, { type: "debit", amount: value, orderId, orderNumber, reason: reason || "Used on an order" });
  return true;
}

/** The customer never paid: reserved money goes back to the spendable balance. */
async function releaseHold(tx, { phone, amount, reason }) {
  const value = round2(amount);
  if (!(value > 0)) return null;
  const key = requirePhone(phone);

  const moved = await tx.walletAccount.updateMany({
    where: { phone: key, held: { gte: value } },
    data: { held: { decrement: value }, balance: { increment: value } },
  });
  if (moved.count === 0) return null;
  const account = await tx.walletAccount.findUnique({ where: { phone: key } });
  await writeLedger(tx, account, { type: "release", amount: value, reason: reason || "Online payment not completed - amount returned" });
  return account;
}

/**
 * Gives back money reserved by checkouts that were never paid. Safe to run any time and
 * from several places at once: each pending checkout is flipped held -> released by one
 * conditional update, so only one caller ever releases it (and a payment that arrives at
 * the same moment either captures first or finds it released - never both).
 */
async function releaseExpiredHolds({ phone = null, olderThanMs = HOLD_TTL_MS } = {}) {
  const cutoff = new Date(Date.now() - olderThanMs);
  const rows = await prisma.pendingCheckout.findMany({
    where: { walletState: "held", createdAt: { lt: cutoff }, ...(phone ? { walletPhone: normalizePhone(phone) } : {}) },
    select: { id: true, walletPhone: true, walletHold: true },
    take: 200,
  });

  let released = 0;
  for (const row of rows) {
    try {
      await prisma.$transaction(async (tx) => {
        const flipped = await tx.pendingCheckout.updateMany({
          where: { id: row.id, walletState: "held" },
          data: { walletState: "released" },
        });
        if (flipped.count === 1) {
          await releaseHold(tx, { phone: row.walletPhone, amount: row.walletHold });
          released += 1;
        }
      });
    } catch (err) {
      // One bad row must not stop the others; it is retried on the next run.
      console.error("[wallet] could not release hold", row.id, err.message);
    }
  }
  return released;
}

/** Spendable balance (0 when the number has no wallet yet). */
async function getBalance(phone, db = prisma) {
  const key = normalizePhone(phone);
  if (key.length !== 10) return 0;
  const account = await db.walletAccount.findUnique({ where: { phone: key } });
  return account ? Number(account.balance) : 0;
}

/**
 * Balance + recent history for one phone number. `includeHolds` adds the reserve/return
 * rows (admin); customers only see money in and money spent.
 */
async function getWallet(phone, { limit = 30, includeHolds = false } = {}) {
  const key = normalizePhone(phone);
  if (key.length !== 10) return { phone: key, balance: 0, held: 0, transactions: [] };

  // A customer opening their wallet should not wait for the timer to get reserved money back.
  await releaseExpiredHolds({ phone: key }).catch(() => {});

  const account = await prisma.walletAccount.findUnique({ where: { phone: key } });
  if (!account) return { phone: key, balance: 0, held: 0, transactions: [] };

  const transactions = await prisma.walletTransaction.findMany({
    where: { accountId: account.id, ...(includeHolds ? {} : { type: { in: ["credit", "debit"] } }) },
    orderBy: { id: "desc" },
    take: limit,
  });
  return {
    phone: key,
    balance: Number(account.balance),
    held: Number(account.held),
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      balanceAfter: Number(t.balanceAfter),
      orderId: t.orderId,
      orderNumber: t.orderNumber,
      reason: t.reason,
      createdAt: t.createdAt,
    })),
  };
}

/** Total of all wallets - what the shop owes its customers (spendable + reserved). */
async function totalLiability() {
  const agg = await prisma.walletAccount.aggregate({ _sum: { balance: true, held: true } });
  return round2(Number(agg._sum.balance || 0) + Number(agg._sum.held || 0));
}

/* ---------------------- how much has an order been paid ---------------------- */

/** Online payment that has really arrived (Razorpay paid, or a verified legacy UPI payment). */
function isOnlinePaid(order) {
  return (
    (order.paymentMethod === "razorpay" && order.paymentStatus === "paid") ||
    (order.paymentMethod === "upi" && order.paymentStatus === "verified")
  );
}

/**
 * Money the customer has really handed over for this order so far, in rupees.
 *  - paid online: the whole bill. The bill shrinks when items are dropped, but the money
 *    paid does not, so it is the current total plus what was already given back.
 *  - anything else (cash on delivery, wallet): only the part paid up front counts -
 *    `walletUsed` (for the rare "online part paid, rest in cash" order it holds the
 *    online amount, see promotePendingCheckout).
 */
function paidSoFar(order) {
  if (isOnlinePaid(order)) return round2(Number(order.total) + Number(order.walletCredited || 0));
  return round2(Number(order.walletUsed || 0));
}

/**
 * Which wallet an order's money goes back to: the signed-in customer's own phone number
 * (the number they verified with an OTP and spent from), else the number on the order.
 */
async function walletPhoneFor(tx, order) {
  if (order.customerId) {
    const customer = await tx.customer.findUnique({ where: { id: order.customerId }, select: { phone: true } });
    if (customer && isValidPhone(customer.phone)) return normalizePhone(customer.phone);
  }
  return normalizePhone(order.customerPhone);
}

/**
 * A cancelled order gives back everything the customer paid, to the wallet (delivery
 * charge included). Runs inside the cancel transaction. Never throws for a bad phone
 * number - the order must still be cancellable - it reports the amount it could not
 * credit so the caller can warn the owner.
 */
async function creditForCancel(tx, order, adminId = null) {
  const paid = paidSoFar(order);
  const amount = round2(Math.max(0, paid - Number(order.walletCredited || 0)));
  if (amount <= 0) return { credited: 0, skipped: 0 };

  const phone = await walletPhoneFor(tx, order);
  if (!isValidPhone(phone)) return { credited: 0, skipped: amount };

  await credit(tx, {
    phone,
    amount,
    orderId: order.id,
    orderNumber: order.orderNumber,
    reason: `Order ${order.orderNumber} cancelled`,
    adminId,
  });
  await tx.order.update({ where: { id: order.id }, data: { walletCredited: { increment: amount } } });
  return { credited: amount, skipped: 0 };
}

/* ------------------------------ admin reports ------------------------------ */

/** Numbers for the admin Wallet page: what is owed, and how the wallet has moved this month. */
async function getSummary() {
  const [sums, withBalance, accounts] = await Promise.all([
    prisma.walletAccount.aggregate({ _sum: { balance: true, held: true } }),
    prisma.walletAccount.count({ where: { balance: { gt: 0 } } }),
    prisma.walletAccount.count(),
  ]);

  // "This month" in India time: the server clock is UTC, the shop is not.
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const monthStart = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 5.5 * 60 * 60 * 1000);
  const moved = await prisma.walletTransaction.groupBy({
    by: ["type"],
    where: { createdAt: { gte: monthStart }, type: { in: ["credit", "debit"] } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const pick = (type) => moved.find((m) => m.type === type);

  return {
    liability: round2(Number(sums._sum.balance || 0) + Number(sums._sum.held || 0)),
    spendable: round2(Number(sums._sum.balance || 0)),
    held: round2(Number(sums._sum.held || 0)),
    accountsWithBalance: withBalance,
    accounts,
    thisMonth: {
      credited: round2(Number(pick("credit")?._sum.amount || 0)),
      creditCount: pick("credit")?._count._all || 0,
      spent: round2(Number(pick("debit")?._sum.amount || 0)),
      spentCount: pick("debit")?._count._all || 0,
    },
  };
}

/** Wallet accounts for the admin report: biggest balance first, with the customer's name when there is one. */
async function listAccounts({ search = "", page = 1, pageSize = 25, onlyWithBalance = true } = {}) {
  const digits = String(search || "").replace(/\D/g, "");
  const where = {
    ...(onlyWithBalance ? { OR: [{ balance: { gt: 0 } }, { held: { gt: 0 } }] } : {}),
    ...(digits ? { phone: { contains: digits } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.walletAccount.findMany({
      where,
      orderBy: [{ balance: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.walletAccount.count({ where }),
  ]);

  const phones = rows.map((r) => r.phone);
  const customers = phones.length
    ? await prisma.customer.findMany({ where: { phone: { in: phones } }, select: { id: true, name: true, phone: true } })
    : [];
  const byPhone = new Map(customers.map((c) => [c.phone, c]));

  const last = rows.length
    ? await prisma.walletTransaction.groupBy({
        by: ["accountId"],
        where: { accountId: { in: rows.map((r) => r.id) } },
        _max: { createdAt: true },
      })
    : [];
  const lastById = new Map(last.map((l) => [l.accountId, l._max.createdAt]));

  return {
    accounts: rows.map((r) => ({
      phone: r.phone,
      balance: Number(r.balance),
      held: Number(r.held),
      customerId: byPhone.get(r.phone)?.id || null,
      customerName: byPhone.get(r.phone)?.name || null,
      lastActivityAt: lastById.get(r.id) || r.updatedAt,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Latest money movements across all wallets (admin report). */
async function recentTransactions({ limit = 30 } = {}) {
  const rows = await prisma.walletTransaction.findMany({
    where: { type: { in: ["credit", "debit"] } },
    orderBy: { id: "desc" },
    take: limit,
    include: { account: { select: { phone: true } } },
  });
  return rows.map((t) => ({
    id: t.id,
    phone: t.account.phone,
    type: t.type,
    amount: Number(t.amount),
    balanceAfter: Number(t.balanceAfter),
    orderId: t.orderId,
    orderNumber: t.orderNumber,
    reason: t.reason,
    createdAt: t.createdAt,
  }));
}

module.exports = {
  HOLD_TTL_MS,
  round2,
  normalizePhone,
  isValidPhone,
  credit,
  debit,
  tryDebit,
  hold,
  captureHold,
  releaseHold,
  releaseExpiredHolds,
  getBalance,
  getWallet,
  totalLiability,
  isOnlinePaid,
  paidSoFar,
  walletPhoneFor,
  creditForCancel,
  getSummary,
  listAccounts,
  recentTransactions,
};
