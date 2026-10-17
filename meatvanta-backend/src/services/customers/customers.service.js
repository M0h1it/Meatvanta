const prisma = require("../../config/db");
const walletService = require("../wallet/wallet.service");

function notFoundError(message = "Customer not found.") {
  const err = new Error(message);
  err.statusCode = 404;
  err.expose = true;
  return err;
}

// Orders that shouldn't count toward what a customer has actually spent.
const SPEND_EXCLUDED_STATUSES = ["cancelled"];

/**
 * Customer list with per-customer order stats. The stats come from a single
 * grouped query rather than a per-row lookup, so this stays one round trip
 * regardless of how many customers are on the page.
 */
async function listCustomers({ search, page = 1, pageSize = 25 } = {}) {
  const trimmedSearch = typeof search === "string" ? search.trim() : "";

  const where = trimmedSearch
    ? {
        OR: [
          { name: { contains: trimmedSearch } },
          { phone: { contains: trimmedSearch } },
        ],
      }
    : {};

  const skip = (page - 1) * pageSize;

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        _count: { select: { orders: true, addresses: true } },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  const customerIds = customers.map((c) => c.id);

  // One grouped query for spend + last order date across the whole page.
  const stats = customerIds.length
    ? await prisma.order.groupBy({
        by: ["customerId"],
        where: {
          customerId: { in: customerIds },
          status: { notIn: SPEND_EXCLUDED_STATUSES },
        },
        _sum: { total: true },
        _max: { createdAt: true },
      })
    : [];

  const statsByCustomer = new Map(stats.map((s) => [s.customerId, s]));

  const withStats = customers.map((customer) => {
    const stat = statsByCustomer.get(customer.id);
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      isActive: customer.isActive,
      createdAt: customer.createdAt,
      lastLoginAt: customer.lastLoginAt,
      orderCount: customer._count.orders,
      addressCount: customer._count.addresses,
      totalSpent: stat?._sum.total ? Number(stat._sum.total) : 0,
      lastOrderAt: stat?._max.createdAt || null,
    };
  });

  return { customers: withStats, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * Groups a customer's orders by calendar month. Done in JS over two columns
 * rather than a raw SQL date_format - keeps it portable and it's a trivial
 * amount of data even for a heavy customer.
 */
function buildMonthlyStats(orders) {
  const byMonth = new Map();

  for (const order of orders) {
    if (SPEND_EXCLUDED_STATUSES.includes(order.status)) continue;

    const date = new Date(order.createdAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    if (!byMonth.has(key)) {
      byMonth.set(key, {
        month: key,
        label: date.toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
        orderCount: 0,
        totalSpent: 0,
      });
    }
    const entry = byMonth.get(key);
    entry.orderCount += 1;
    entry.totalSpent += Number(order.total);
  }

  // Newest month first, capped at a year so the panel stays readable.
  return Array.from(byMonth.values())
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 12);
}

async function getCustomerById(id) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      orders: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { items: true },
      },
    },
  });
  if (!customer) throw notFoundError();

  // Monthly stats come from every order, not just the 50 loaded above - two
  // columns only, so it stays cheap.
  const allOrdersForStats = await prisma.order.findMany({
    where: { customerId: id },
    select: { createdAt: true, total: true, status: true },
    orderBy: { createdAt: "desc" },
  });

  const countableOrders = allOrdersForStats.filter(
    (o) => !SPEND_EXCLUDED_STATUSES.includes(o.status)
  );
  const totalSpent = countableOrders.reduce((sum, o) => sum + Number(o.total), 0);

  // Store credit tied to this customer's phone number (what the shop owes them).
  const wallet = await walletService.getWallet(customer.phone, { limit: 30, includeHolds: true });

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    isActive: customer.isActive,
    createdAt: customer.createdAt,
    lastLoginAt: customer.lastLoginAt,
    addresses: customer.addresses,
    orders: customer.orders,
    wallet: { balance: wallet.balance, held: wallet.held, transactions: wallet.transactions },
    stats: {
      orderCount: allOrdersForStats.length,
      totalSpent,
      averageOrderValue: countableOrders.length ? totalSpent / countableOrders.length : 0,
      lastOrderAt: allOrdersForStats[0]?.createdAt || null,
    },
    monthlyStats: buildMonthlyStats(allOrdersForStats),
  };
}

module.exports = { listCustomers, getCustomerById };
