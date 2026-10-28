const prisma = require("../../config/db");
const { validateStatusUpdate } = require("../../validators/orders/orders.validator");
const deliverySettingsService = require("../deliverySettings/deliverySettings.service");
const notificationsService = require("../notifications/notifications.service");
const razorpayService = require("../payments/razorpay.service");
const ist = require("../../utils/istDate.util");
const couponsService = require("../coupons/coupons.service");
const combosService = require("../combos/combos.service");
const newCustomerOffer = require("../newCustomerOffer/newCustomerOffer.service");
const wallet = require("../wallet/wallet.service");
const orderAlerts = require("../push/orderAlerts.service");

function notFoundError(message) {
  const err = new Error(message);
  err.statusCode = 404;
  err.expose = true;
  return err;
}
function badRequestError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.expose = true;
  return err;
}

/**
 * Two transactions that touch the same wallet row at the same moment (a customer double
 * tapping, or two devices) can make MySQL abort one of them with a deadlock (Prisma P2034).
 * An aborted transaction wrote nothing, so running it again is safe: it either succeeds or
 * fails cleanly (e.g. "balance not enough") because the first one has finished by then.
 */
async function retryOnConflict(run, attempts = 3) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      const isConflict = err?.code === "P2034" || /deadlock|write conflict/i.test(String(err?.message || ""));
      if (!isConflict) throw err;
      if (attempt >= attempts) {
        const busy = new Error("Your order is being processed at the same time as another one. Please try again.");
        busy.statusCode = 409;
        busy.expose = true;
        throw busy;
      }
      await new Promise((resolve) => setTimeout(resolve, 40 * attempt));
    }
  }
}

/**
 * Turns the customer's chosen option ids into a priced, validated snapshot.
 * Prices are always re-read from the DB - the browser's numbers are never used.
 * Also enforces required groups and single-select rules server-side, so a
 * tampered request can't skip a mandatory choice or stack two marinations.
 */
async function resolveSelectedOptions(optionIds, productId) {
  if (!Array.isArray(optionIds) || optionIds.length === 0) {
    // Still need to check nothing required was skipped.
    const requiredGroups = await prisma.productOptionGroup.count({
      where: { productId, isRequired: true },
    });
    if (requiredGroups > 0) {
      throw badRequestError("Please choose the required options for this item.");
    }
    return { selectedOptions: [], optionsTotal: 0 };
  }

  const options = await prisma.productOption.findMany({
    where: { id: { in: optionIds } },
    include: { group: true },
  });

  if (options.length !== optionIds.length) {
    throw notFoundError("One of the selected options is no longer available.");
  }

  for (const option of options) {
    if (option.group.productId !== productId) {
      throw badRequestError("An option was selected that doesn't belong to this product.");
    }
    if (!option.isAvailable) {
      throw badRequestError(`"${option.name}" isn't available right now.`);
    }
  }

  // Single-select groups may appear at most once.
  const countByGroup = new Map();
  for (const option of options) {
    countByGroup.set(option.groupId, (countByGroup.get(option.groupId) || 0) + 1);
  }
  for (const option of options) {
    if (!option.group.allowMultiple && countByGroup.get(option.groupId) > 1) {
      throw badRequestError(`Please pick only one ${option.group.name.toLowerCase()}.`);
    }
  }

  // Every required group must be represented.
  const requiredGroups = await prisma.productOptionGroup.findMany({
    where: { productId, isRequired: true },
  });
  for (const group of requiredGroups) {
    if (!countByGroup.has(group.id)) {
      throw badRequestError(`Please choose a ${group.name.toLowerCase()}.`);
    }
  }

  const optionsTotal = options.reduce((sum, o) => sum + Number(o.extraPrice), 0);
  const selectedOptions = options.map((o) => ({
    groupName: o.group.name,
    optionName: o.name,
    extraPrice: Number(o.extraPrice),
  }));

  return { selectedOptions, optionsTotal };
}

const orderInclude = {
  items: true,
  createdByAdmin: { select: { id: true, name: true } },
  deliveryAdmin: { select: { id: true, name: true, phone: true } },
};

/**
 * Recomputes every line item's price server-side from the current
 * ProductVariant row - the client's submitted prices are never trusted.
 * Also enforces that a variant marked out-of-stock can't be ordered.
 */
async function createOrder({ customerName, customerPhone, deliveryAddress, items, deliveryCharge, discount, paymentMethod, notes }, actingAdminId) {
  const variantIds = items.map((i) => i.productVariantId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: { select: { name: true, isCombo: true } } },
  });

  const variantsById = new Map(variants.map((v) => [v.id, v]));
  // Combos: everything inside must be available; the contents are saved on the line.
  const comboContents = await combosService.checkoutSnapshots(
    variants.filter((v) => v.product.isCombo).map((v) => v.productId)
  );

  const lineItems = [];
  for (const item of items) {
    const variant = variantsById.get(item.productVariantId);
    if (!variant) {
      throw notFoundError(`Variant id ${item.productVariantId} does not exist.`);
    }
    if (!variant.isInStock) {
      throw badRequestError(`"${variant.product.name} - ${variant.label}" is marked out of stock.`);
    }

    const { selectedOptions, optionsTotal } = await resolveSelectedOptions(
      item.optionIds,
      variant.productId
    );

    const unitPrice = Number(variant.price);
    lineItems.push({
      productVariantId: variant.id,
      productName: variant.product.name,
      variantLabel: variant.label,
      unitPrice,
      selectedOptions: selectedOptions.length ? selectedOptions : undefined,
      optionsTotal,
      comboItems: comboContents.get(variant.productId),
      quantity: item.quantity,
      orderedQuantity: item.quantity,
      lineTotal: (unitPrice + optionsTotal) * item.quantity,
    });
  }

  const subtotal = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
  const deliveryChargeValue = deliveryCharge ?? 0;
  const discountValue = discount ?? 0;
  const total = Math.max(0, subtotal + deliveryChargeValue - discountValue);

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber: "PENDING",
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        deliveryAddress: deliveryAddress || null,
        paymentMethod: paymentMethod || "cod",
        subtotal,
        deliveryCharge: deliveryChargeValue,
        discount: discountValue,
        total,
        notes: notes || null,
        createdByAdminId: actingAdminId,
        items: { create: lineItems },
      },
    });

    return tx.order.update({
      where: { id: created.id },
      data: { orderNumber: `ORD-${1000 + created.id}` },
      include: orderInclude,
    });
  });

  return order;
}

async function listOrders({
  status, search, riderId, paymentMethod, paymentStatus, from, to, page = 1, pageSize = 25,
} = {}) {
  const where = {};
  // "active" = everything still in motion; otherwise one status or a comma list.
  if (status === "active") {
    where.status = { in: ["placed", "preparing", "out_for_delivery"] };
  } else if (status) {
    const list = String(status).split(",").map((s) => s.trim()).filter(Boolean);
    where.status = list.length > 1 ? { in: list } : list[0];
  }

  // "none" = no rider yet; a number = that rider.
  if (riderId === "none") where.deliveryAdminId = null;
  else if (Number.isInteger(Number(riderId)) && Number(riderId) > 0) where.deliveryAdminId = Number(riderId);

  if (paymentMethod) where.paymentMethod = paymentMethod;
  if (paymentStatus) where.paymentStatus = paymentStatus;

  // Date range on the order date, in India time (to = the whole of that day).
  const range = {};
  if (from && ist.isValidDateKey(from)) range.gte = ist.startOfIstDay(from);
  if (to && ist.isValidDateKey(to)) range.lt = ist.startOfIstDay(ist.addDays(to, 1));
  if (range.gte || range.lt) where.createdAt = range;

  // One box, three things staff actually search by at the counter.
  const trimmedSearch = typeof search === "string" ? search.trim() : "";
  if (trimmedSearch) {
    where.OR = [
      { orderNumber: { contains: trimmedSearch } },
      { customerName: { contains: trimmedSearch } },
      { customerPhone: { contains: trimmedSearch } },
    ];
  }

  const skip = (page - 1) * pageSize;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: orderInclude,
    }),
    prisma.order.count({ where }),
  ]);

  return { orders, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

async function getOrderById(id) {
  const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
  if (!order) throw notFoundError("Order not found.");
  return order;
}

async function updateOrderStatus(id, requestedStatus, actingAdminId = null) {
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) throw notFoundError("Order not found.");

  const transitionError = validateStatusUpdate(existing.status, requestedStatus);
  if (transitionError) throw badRequestError(transitionError);

  const data = { status: requestedStatus };
  if (requestedStatus === "delivered") {
    data.deliveredAt = new Date(); // lets analytics count the sale on its delivery day
    if (existing.paymentMethod === "cod") {
      data.paymentStatus = "paid"; // COD collected on delivery
      data.paymentVerifiedAt = new Date(); // = the moment the cash was collected
    }
  }

  if (requestedStatus === "cancelled") {
    // A cancelled order gives its coupon use back to the customer, and whatever the
    // customer already paid (online or from the wallet) goes to their wallet.
    return prisma.$transaction(async (tx) => {
      await couponsService.releaseRedemption(tx, id);
      await wallet.creditForCancel(tx, existing, actingAdminId);
      return tx.order.update({ where: { id }, data, include: orderInclude });
    });
  }

  return prisma.order.update({ where: { id }, data, include: orderInclude });
}

async function cancelOrder(id, actingAdminId = null) {
  return updateOrderStatus(id, "cancelled", actingAdminId);
}

/** Powers the admin dashboard's stat cards - counts only, cheap to compute. */
async function getDashboardStats() {
  // Midnight in India, not midnight on the server clock (the VPS runs in UTC,
  // which made "today" start at 5:30 AM IST).
  const startOfToday = ist.startOfIstDay(ist.todayKey());

  const [todayOrders, pendingCount, todayDelivered, totalCustomers] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.order.count({ where: { status: { in: ["placed", "preparing", "out_for_delivery"] } } }),
    prisma.order.findMany({
      where: { createdAt: { gte: startOfToday }, status: { not: "cancelled" } },
      select: { total: true },
    }),
    // Stock counts aren't meaningful for a fresh-cut business - customer
    // count is the number the owner actually cares about growing.
    prisma.customer.count({ where: { isActive: true } }),
  ]);

  const todayRevenue = todayDelivered.reduce((sum, o) => sum + Number(o.total), 0);

  // What the shop owes its customers in wallet balance (spendable + reserved for a payment).
  const walletLiability = await wallet.totalLiability();

  return { todayOrdersCount: todayOrders, pendingCount, todayRevenue, totalCustomers, walletLiability };
}

/**
 * Prices a customer's cart server-side - same rules as createPublicOrder used
 * to apply inline. Split out so both the "cod" path (creates the Order right
 * away) and the "razorpay" path (stashes the draft in PendingCheckout until
 * payment is confirmed) price things identically, from one place.
 */
async function priceCheckoutItems(items) {
  const variantIds = items.map((i) => i.productVariantId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: { select: { name: true, isActive: true, isInStock: true, categoryId: true, isCombo: true } } },
  });
  const variantsById = new Map(variants.map((v) => [v.id, v]));
  // Combos: everything inside must be available; the contents are saved on the line.
  const comboContents = await combosService.checkoutSnapshots(
    variants.filter((v) => v.product.isCombo).map((v) => v.productId)
  );

  const lineItems = [];
  // Same order as lineItems; product/category per line so coupons can target
  // them. Kept separate because lineItems go straight into OrderItem rows.
  const lines = [];
  for (const item of items) {
    const variant = variantsById.get(item.productVariantId);
    if (!variant || !variant.product.isActive) {
      throw notFoundError("One of the items in your cart is no longer available.");
    }
    // Product-level availability wins over variant - if the owner pulled the
    // whole item for today, no variant of it can be ordered.
    if (!variant.product.isInStock) {
      throw badRequestError(`"${variant.product.name}" is not available today.`);
    }
    if (!variant.isInStock) {
      throw badRequestError(`"${variant.product.name} - ${variant.label}" is not available today.`);
    }

    const { selectedOptions, optionsTotal } = await resolveSelectedOptions(
      item.optionIds,
      variant.productId
    );

    const unitPrice = Number(variant.price); // always re-read server-side
    lineItems.push({
      productVariantId: variant.id,
      productName: variant.product.name,
      variantLabel: variant.label,
      unitPrice,
      selectedOptions: selectedOptions.length ? selectedOptions : undefined,
      optionsTotal,
      comboItems: comboContents.get(variant.productId),
      quantity: item.quantity,
      orderedQuantity: item.quantity,
      lineTotal: (unitPrice + optionsTotal) * item.quantity,
    });
    lines.push({
      lineTotal: (unitPrice + optionsTotal) * item.quantity,
      productId: variant.productId,
      categoryId: variant.product.categoryId,
    });
  }

  return { lineItems, lines };
}

/**
 * What the cart / checkout page shows ("You save ₹120"). Nothing is reserved -
 * the same check runs again, for real, when the order is placed.
 *
 * `code` is optional (a first-time customer can get the welcome offer with no
 * coupon). `paymentMethod` ("cod" | "razorpay") decides whether the welcome
 * offer counts; without it only the coupon is evaluated. Either way the
 * customer gets ONE saving: whichever of coupon / welcome offer is bigger.
 */
async function previewCheckout({ code, items, customerPhone, paymentMethod }) {
  const settings = await deliverySettingsService.getSettings();
  const { lines } = await priceCheckoutItems(items);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const isFlatCharge = settings.deliveryChargeMode === "flat";
  const deliveryCharge = isFlatCharge ? Number(settings.flatDeliveryCharge) : 0;

  const applied = await applyBestOffer({ couponCode: code, lines, subtotal, deliveryCharge, customerPhone, paymentMethod });
  const info = applied.welcomeInfo;
  return {
    code: applied.coupon ? applied.coupon.code : applied.welcome ? newCustomerOffer.WELCOME_CODE : null,
    kind: applied.coupon ? "coupon" : applied.welcome ? "welcome" : null,
    summary: applied.summary || null,
    freeDelivery: applied.freeDelivery,
    discount: applied.discount,
    // What the customer saves in total (items + waived delivery).
    savings: applied.savings,
    subtotal,
    deliveryCharge: applied.deliveryCharge,
    deliveryChargeMode: settings.deliveryChargeMode,
    total: subtotal + applied.deliveryCharge - applied.discount,
    // Set when the welcome offer saved more than the typed coupon, so the
    // coupon was left unused: the page tells the customer.
    supersededCoupon: applied.supersededCoupon || null,
    welcome: info
      ? {
          percent: info.percent,
          headline: info.headline,
          methods: info.methods,
          minOrderValue: info.minOrderValue,
          maxDiscount: info.maxDiscount,
          discountByMethod: { razorpay: info.byMethod.razorpay.discount, cod: info.byMethod.cod.discount },
          shortByMethod: { razorpay: info.byMethod.razorpay.short, cod: info.byMethod.cod.short },
        }
      : null,
  };
}

/** Older callers (POST /coupons/apply): a coupon-only preview. */
async function previewCoupon({ code, items, customerPhone }) {
  return previewCheckout({ code, items, customerPhone });
}

/**
 * Applies the customer's coupon (if any) to a priced cart. Returns what goes
 * on the order. Free delivery is stored as deliveryCharge 0 + freeDelivery,
 * not as a discount, so the order total stays simple.
 */
async function applyCouponToCheckout({ couponCode, lines, subtotal, deliveryCharge, customerPhone }) {
  if (!couponCode) {
    return { coupon: null, discount: 0, deliveryCharge, freeDelivery: false, savings: 0 };
  }
  const result = await couponsService.evaluateCoupon({ code: couponCode, lines, deliveryCharge, customerPhone });
  if (result.freeDelivery) {
    return { coupon: result.coupon, summary: result.summary, discount: 0, deliveryCharge: 0, freeDelivery: true, savings: deliveryCharge };
  }
  const discount = Math.min(result.discount, subtotal);
  return { coupon: result.coupon, summary: result.summary, discount, deliveryCharge, freeDelivery: false, savings: discount };
}

/**
 * One saving per order. Evaluates the coupon (if a code was typed - an invalid
 * code still throws, as before) and the new-customer welcome offer for this
 * payment method, and keeps whichever saves the customer more. When the welcome
 * offer wins the coupon is NOT applied or redeemed, so it isn't wasted.
 * A tie goes to the coupon the customer chose.
 */
async function applyBestOffer({ couponCode, lines, subtotal, deliveryCharge, customerPhone, paymentMethod }) {
  const couponResult = await applyCouponToCheckout({ couponCode, lines, subtotal, deliveryCharge, customerPhone });

  const info = await newCustomerOffer.describeFor({ subtotal, customerPhone });
  const methodKey = paymentMethod === "cod" ? "cod" : paymentMethod === "razorpay" ? "razorpay" : null;
  const welcomeDiscount = info && methodKey ? info.byMethod[methodKey].discount : 0;

  if (welcomeDiscount > 0 && welcomeDiscount > couponResult.savings) {
    return {
      coupon: null,
      welcome: true,
      summary: `Welcome offer - ${info.percent}% off your first order`,
      discount: welcomeDiscount,
      deliveryCharge, // untouched: a free-delivery coupon is not applied either
      freeDelivery: false,
      savings: welcomeDiscount,
      supersededCoupon: couponResult.coupon ? couponResult.coupon.code : null,
      welcomeInfo: info,
    };
  }
  return { ...couponResult, welcome: false, supersededCoupon: null, welcomeInfo: info };
}

/** Alerts the shop that a real, paid-for (or COD) order came in. Deliberately
 * fire-and-forget - see createNotification - and never called for a
 * still-unpaid Razorpay draft, since that isn't a real order yet. */
async function notifyNewOrder(order) {
  const itemSummary = order.items.map((i) => `${i.quantity}x ${i.productName}`).join(", ");
  await notificationsService.createNotification({
    type: "new_order",
    title: `New order ${order.orderNumber}`,
    message:
      `${order.customerName} · Rs.${Number(order.total).toFixed(0)} · ${order.paymentMethod.toUpperCase()}` +
      ` — ${itemSummary}`.slice(0, 480),
    entityType: "Order",
    entityId: order.id,
  });

  // The siren on the order-alert app phones. Not awaited on purpose: a slow or failing push
  // must never slow down or fail the order (it catches and logs its own errors).
  orderAlerts.notifyNewOrder(order);
}

/** A map pin is either both numbers in range, or nothing - never half a pin. */
function normalisePin(latitude, longitude) {
  const lat = latitude === null || latitude === undefined || latitude === "" ? NaN : Number(latitude);
  const lng = longitude === null || longitude === undefined || longitude === "" ? NaN : Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { latitude: null, longitude: null };
  }
  return { latitude: lat, longitude: lng };
}

/**
 * Customer-site order creation. Differs from the admin path in three ways:
 *  - re-validates the delivery date against current settings (it may have
 *    expired between page load and submit)
 *  - pulls the delivery charge from settings rather than trusting the client
 *  - for "razorpay", nothing is written to the Order table yet. A customer
 *    can open the payment widget just to see the final price/a discount and
 *    close it without ever creating a "phantom" order the shop has to see -
 *    the priced draft is stashed in PendingCheckout and only becomes a real
 *    Order once payment is actually confirmed (see promotePendingCheckout).
 */
async function createPublicOrder(payload, customerId = null, accountPhone = null) {
  const {
    customerName, customerPhone, deliveryAddress, deliveryDate,
    items, paymentMethod, notes, couponCode,
  } = payload;
  const useWallet = payload.useWallet === true;
  const pin = normalisePin(payload.deliveryLatitude, payload.deliveryLongitude);

  // The wallet is only for a signed-in customer: their phone number was verified with an OTP,
  // so nobody can spend someone else's balance by typing their number into a guest checkout.
  if (useWallet && !customerId) {
    throw badRequestError("Sign in to use your wallet.");
  }

  const settings = await deliverySettingsService.getSettings();

  const dateStillValid = await deliverySettingsService.isDateSelectable(deliveryDate);
  if (!dateStillValid) {
    throw badRequestError("That delivery date is no longer available. Please pick another.");
  }

  const { lineItems, lines } = await priceCheckoutItems(items);
  const subtotal = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
  const isFlatCharge = settings.deliveryChargeMode === "flat";
  const baseDeliveryCharge = isFlatCharge ? Number(settings.flatDeliveryCharge) : 0;

  // Coupon is re-checked here from the priced cart - the preview the customer
  // saw earlier is never trusted.
  const applied = await applyBestOffer({
    couponCode,
    lines,
    subtotal,
    deliveryCharge: baseDeliveryCharge,
    customerPhone,
    paymentMethod,
  });
  const deliveryCharge = applied.deliveryCharge;
  const discount = applied.discount;
  const total = wallet.round2(subtotal + deliveryCharge - discount);
  // A welcome offer has no coupon row - only its label is saved on the order.
  const couponFields = applied.coupon
    ? { couponId: applied.coupon.id, couponCode: applied.coupon.code, freeDelivery: applied.freeDelivery }
    : applied.welcome
      ? { couponCode: newCustomerOffer.WELCOME_CODE }
      : {};

  // ---- wallet: how much of the bill it pays (the server decides, never the browser) ----
  let walletKey = null;
  let walletApplied = 0;
  if (useWallet) {
    walletKey = wallet.normalizePhone(accountPhone);
    if (walletKey.length !== 10) {
      throw badRequestError("Your account needs a valid phone number to use the wallet.");
    }
    walletApplied = wallet.round2(Math.max(0, Math.min(await wallet.getBalance(walletKey), total)));
    // Razorpay cannot charge less than Rs.1, so keep Rs.1 for the gateway if the wallet is nearly enough.
    if (walletApplied > 0 && walletApplied < total && paymentMethod === "razorpay" && total - walletApplied < 1) {
      walletApplied = wallet.round2(Math.max(0, total - 1));
    }
  }
  const fullByWallet = walletApplied > 0 && walletApplied >= total;
  const payable = wallet.round2(total - walletApplied);

  // Only the way the REST is paid has to be switched on. A bill the wallet covers entirely
  // needs neither cash nor the gateway.
  if (!fullByWallet) {
    if (paymentMethod === "cod" && !settings.codEnabled) {
      throw badRequestError("Cash on delivery isn't available right now.");
    }
    // The existing "upiEnabled" toggle in Delivery Settings now gates the
    // Razorpay ("Pay Online") option too - it still means "is online/non-COD
    // payment available today", just via a gateway instead of a manual UPI ID.
    if (paymentMethod === "razorpay" && !settings.upiEnabled) {
      throw badRequestError("Online payment isn't available right now.");
    }
  }

  // ---- paid by the wallet entirely, or cash on delivery (with or without a wallet part) ----
  if (fullByWallet || paymentMethod === "cod") {
    // Flat charge: nothing is left to pay, so the order is "paid by wallet". In manual charge
    // mode the delivery charge is still to be set, so it stays a COD order whose cash due is
    // whatever the wallet did not cover (the charge, once it is set).
    const method = fullByWallet && isFlatCharge ? "wallet" : "cod";
    const isPaidNow = method === "wallet";

    const order = await retryOnConflict(() => prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber: "PENDING",
          customerId, // null for guest checkout - the order still works either way
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          deliveryAddress: deliveryAddress.trim(),
          deliveryLatitude: pin.latitude,
          deliveryLongitude: pin.longitude,
          deliveryDate: new Date(`${deliveryDate}T00:00:00`),
          deliveryStartTime: settings.deliveryStartTime,
          deliveryEndTime: settings.deliveryEndTime,
          deliveryChargeStatus: isFlatCharge ? "confirmed" : "pending",
          paymentMethod: method,
          paymentStatus: isPaidNow ? "paid" : "unpaid", // cod: collected on delivery
          paymentVerifiedAt: isPaidNow ? new Date() : null,
          walletUsed: walletApplied,
          subtotal,
          deliveryCharge,
          discount,
          total,
          ...couponFields,
          notes: notes ? notes.trim() : null,
          createdByAdminId: null, // placed by a customer, not staff
          items: { create: lineItems },
        },
      });

      if (applied.coupon) {
        // Checks the total-uses limit again atomically - the last use can't be taken twice.
        await couponsService.recordRedemption(tx, {
          couponId: applied.coupon.id,
          orderId: created.id,
          customerPhone,
          customerId,
          discount: applied.savings,
          enforceLimit: true,
        });
      }

      const orderNumber = `ORD-${1000 + created.id}`;
      // In the same transaction as the order: if the balance is no longer there (a parallel
      // checkout spent it), this throws and the order is not created at all.
      if (walletApplied > 0) {
        await wallet.debit(tx, {
          phone: walletKey,
          amount: walletApplied,
          orderId: created.id,
          orderNumber,
          reason: `Used on order ${orderNumber}`,
        });
      }

      return tx.order.update({
        where: { id: created.id },
        data: { orderNumber },
        include: orderInclude,
      });
    }));

    await notifyNewOrder(order);
    return { order, razorpayKeyId: null, razorpayOrderId: null, amount: null };
  }

  // paymentMethod === "razorpay": open the gateway order, but do NOT create
  // our own Order row yet - only a PendingCheckout holding everything needed
  // to build it later. Nothing here is visible to the shop until paid.
  // The gateway is asked for the bill minus the wallet part.
  const razorpayOrder = await razorpayService.createRazorpayOrder({
    amountInRupees: payable,
    receipt: `checkout-${Date.now()}`,
    notes: { customerPhone: customerPhone.trim() },
  });

  await retryOnConflict(() => prisma.$transaction(async (tx) => {
    // Reserve the wallet part while the payment window is open (released again after ~20
    // minutes if it is never paid - see wallet.releaseExpiredHolds).
    if (walletApplied > 0) {
      await wallet.hold(tx, { phone: walletKey, amount: walletApplied, reason: "Reserved for an online payment" });
    }
    await tx.pendingCheckout.create({
      data: {
        razorpayOrderId: razorpayOrder.id,
        customerId,
        amount: payable,
        walletPhone: walletApplied > 0 ? walletKey : null,
        walletHold: walletApplied,
        walletState: walletApplied > 0 ? "held" : null,
        payload: {
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          deliveryAddress: deliveryAddress.trim(),
          deliveryLatitude: pin.latitude,
          deliveryLongitude: pin.longitude,
          deliveryDate,
          notes: notes ? notes.trim() : null,
          lineItems,
          subtotal,
          deliveryCharge,
          discount,
          total,
          walletUsed: walletApplied,
          isFlatCharge,
          couponId: applied.coupon ? applied.coupon.id : null,
          couponCode: applied.coupon ? applied.coupon.code : applied.welcome ? newCustomerOffer.WELCOME_CODE : null,
          freeDelivery: applied.freeDelivery,
          couponSavings: applied.savings,
          deliveryStartTime: settings.deliveryStartTime,
          deliveryEndTime: settings.deliveryEndTime,
        },
      },
    });
  }));

  return {
    order: null,
    razorpayOrderId: razorpayOrder.id,
    razorpayKeyId: razorpayService.getPublicKeyId(),
    amount: payable,
  };
}

/**
 * Order tracking without accounts. Requires the phone number as well as the
 * order number so someone can't walk the sequence (ORD-1001, ORD-1002...)
 * and read other people's addresses.
 */
async function getOrderForTracking(orderNumber, customerPhone) {
  const order = await prisma.order.findUnique({
    where: { orderNumber: orderNumber.trim().toUpperCase() },
    include: { items: true },
  });

  if (!order || order.customerPhone !== customerPhone.trim()) {
    throw notFoundError("No order found with that order number and phone number.");
  }
  return order;
}

/** Order history for a signed-in customer - no order number needed. */
async function listCustomerOrders(customerId, { page = 1, pageSize = 20 } = {}) {
  const skip = (page - 1) * pageSize;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: { items: true },
    }),
    prisma.order.count({ where: { customerId } }),
  ]);

  return { orders, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Scoped by customerId, so one customer can never read another's order. */
async function getCustomerOrder(customerId, orderNumber) {
  const order = await prisma.order.findFirst({
    where: { customerId, orderNumber: orderNumber.trim().toUpperCase() },
    include: { items: true },
  });
  if (!order) throw notFoundError("Order not found.");
  return order;
}

/** Admin confirms or rejects a legacy manual-UPI (phone order) payment. */
async function verifyPayment(id, { paymentStatus, paymentNote }) {
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) throw notFoundError("Order not found.");
  if (existing.paymentMethod !== "upi") {
    throw badRequestError("Only manually-entered UPI payments need verification.");
  }

  return prisma.order.update({
    where: { id },
    data: {
      paymentStatus,
      paymentNote: paymentNote || null,
      paymentVerifiedAt: paymentStatus === "verified" ? new Date() : null,
    },
    include: orderInclude,
  });
}

/**
 * Turns a still-pending checkout draft into the real, shop-visible Order -
 * the moment (and only the moment) payment is actually confirmed. Called
 * from both verifyRazorpayPayment (the widget's own success callback) and
 * the webhook safety net, so it's written to be idempotent either way:
 *  - if an Order already exists for this razorpayOrderId, that path already
 *    won the race - just return it, don't create a second one.
 *  - if no PendingCheckout row exists either, this isn't a checkout we
 *    started (or it was already promoted and cleaned up) - return null.
 */
async function promotePendingCheckout(razorpayOrderId, razorpayPaymentId) {
  const existingOrder = await prisma.order.findFirst({
    where: { razorpayOrderId },
    include: orderInclude,
  });
  if (existingOrder) return existingOrder;

  const pending = await prisma.pendingCheckout.findUnique({ where: { razorpayOrderId } });
  if (!pending) return null;

  const d = pending.payload;
  // Wallet money reserved for this checkout (0 for an ordinary online payment).
  const reserved = Number(pending.walletHold || 0);
  let walletShortfall = 0;

  const order = await retryOnConflict(() => prisma.$transaction(async (tx) => {
    walletShortfall = 0; // a retried attempt starts from scratch
    const created = await tx.order.create({
      data: {
        orderNumber: "PENDING",
        customerId: pending.customerId,
        customerName: d.customerName,
        customerPhone: d.customerPhone,
        deliveryAddress: d.deliveryAddress,
        deliveryLatitude: d.deliveryLatitude ?? null,
        deliveryLongitude: d.deliveryLongitude ?? null,
        deliveryDate: new Date(`${d.deliveryDate}T00:00:00`),
        deliveryStartTime: d.deliveryStartTime,
        deliveryEndTime: d.deliveryEndTime,
        deliveryChargeStatus: d.isFlatCharge ? "confirmed" : "pending",
        paymentMethod: "razorpay",
        paymentStatus: "paid",
        razorpayOrderId,
        razorpayPaymentId,
        paymentVerifiedAt: new Date(),
        walletUsed: reserved,
        subtotal: d.subtotal,
        deliveryCharge: d.deliveryCharge,
        discount: d.discount || 0,
        total: d.total,
        ...(d.couponCode ? { couponCode: d.couponCode, freeDelivery: Boolean(d.freeDelivery) } : {}),
        notes: d.notes,
        createdByAdminId: null,
        items: { create: d.lineItems },
      },
    });

    if (d.couponId) {
      // The customer already paid the discounted price, so the discount is
      // honoured even if the coupon ran out or was switched off meanwhile.
      const stillExists = await tx.coupon.findUnique({ where: { id: d.couponId } });
      if (stillExists) {
        await tx.order.update({ where: { id: created.id }, data: { couponId: d.couponId } });
        await couponsService.recordRedemption(tx, {
          couponId: d.couponId,
          orderId: created.id,
          customerPhone: d.customerPhone,
          customerId: pending.customerId,
          discount: d.couponSavings || d.discount || 0,
          enforceLimit: false,
        });
      }
    }

    const numberNow = `ORD-${1000 + created.id}`;

    // The wallet part: the payment came through, so the reserved money is now really spent.
    if (reserved > 0) {
      const flipped = await tx.pendingCheckout.updateMany({
        where: { id: pending.id, walletState: "held" },
        data: { walletState: "captured" },
      });
      let taken = false;
      if (flipped.count === 1) {
        taken = await wallet.captureHold(tx, {
          phone: pending.walletPhone,
          amount: reserved,
          orderId: created.id,
          orderNumber: numberNow,
          reason: `Used on order ${numberNow}`,
        });
      }
      if (!taken) {
        // The payment arrived after the reservation had already been given back (or the
        // reservation is gone): try to take the amount from the balance now.
        taken = await wallet.tryDebit(tx, {
          phone: pending.walletPhone,
          amount: reserved,
          orderId: created.id,
          orderNumber: numberNow,
          reason: `Used on order ${numberNow}`,
        });
      }
      if (!taken) {
        // Still not there (the customer spent it elsewhere meanwhile). The online part IS paid,
        // so the order stands; the missing wallet part is collected in cash on delivery.
        // `walletUsed` then holds what was paid up front, so cash due = total - walletUsed.
        walletShortfall = reserved;
        const paidOnline = wallet.round2(Number(d.total) - reserved);
        await tx.order.update({
          where: { id: created.id },
          data: {
            paymentMethod: "cod",
            paymentStatus: "unpaid",
            paymentVerifiedAt: null,
            walletUsed: paidOnline,
            paymentNote: `Paid online Rs.${paidOnline.toFixed(0)}. Rs.${reserved.toFixed(0)} could not be taken from the wallet - collect it in cash on delivery.`,
          },
        });
      }
    }

    const withNumber = await tx.order.update({
      where: { id: created.id },
      data: { orderNumber: numberNow },
      include: orderInclude,
    });

    // Draft's job is done - remove it so it can't be promoted twice.
    await tx.pendingCheckout.delete({ where: { id: pending.id } });

    return withNumber;
  }));

  if (walletShortfall > 0) {
    await notificationsService.createNotification({
      type: "wallet_shortfall",
      title: `Collect Rs.${walletShortfall.toFixed(0)} on delivery`,
      message: `${order.orderNumber}: the wallet part of this order could not be taken (balance changed). Collect Rs.${walletShortfall.toFixed(0)} in cash.`,
      entityType: "Order",
      entityId: order.id,
    });
  }

  await notifyNewOrder(order);
  await notificationsService.createNotification({
    type: "payment_received",
    title: `Payment received for ${order.orderNumber}`,
    message: `${order.customerName} · Rs.${Number(order.total).toFixed(0)} · paid via Razorpay`,
    entityType: "Order",
    entityId: order.id,
  });

  return order;
}

/**
 * Confirms a Razorpay payment the checkout widget just completed. The
 * signature is the actual cryptographic proof of payment; once it checks
 * out, this is the first moment the customer's order becomes real (see
 * promotePendingCheckout) - so a customer who never gets this far (closes
 * the widget, payment fails) never leaves anything for the shop to see.
 */
async function verifyRazorpayPayment({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const isValid = razorpayService.verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });
  if (!isValid) {
    throw badRequestError("Payment verification failed. Please try again or contact us.");
  }

  const order = await promotePendingCheckout(razorpayOrderId, razorpayPaymentId);
  if (!order) {
    throw notFoundError(
      "We couldn't find this checkout. If money was deducted, it will reflect shortly - please check My Orders."
    );
  }
  return order;
}

/**
 * Safety net for the case where the customer paid but their browser closed
 * (or the network dropped) before the widget's own success callback could
 * call verifyRazorpayPayment. Razorpay retries this webhook until it gets a
 * 200, so promotePendingCheckout's idempotency is what makes that safe - it
 * either creates the order for the first time here, or finds the widget path
 * already did, and never throws for a payment it doesn't recognise.
 */
async function markOrderPaidFromWebhook({ razorpayOrderId, razorpayPaymentId }) {
  return promotePendingCheckout(razorpayOrderId, razorpayPaymentId);
}

/** Used in manual charge mode, once the admin has checked the address. */
async function setDeliveryCharge(id, deliveryCharge) {
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) throw notFoundError("Order not found.");

  // A free-delivery coupon keeps the charge at 0 whatever amount is entered.
  const charge = existing.freeDelivery ? 0 : Number(deliveryCharge);
  // Items the shop could not send stay out of the bill (see orderAdjustments.service.js).
  const total = Math.max(
    0,
    Number(existing.subtotal) - Number(existing.unavailableAmount || 0) + charge - Number(existing.discount)
  );

  return prisma.order.update({
    where: { id },
    data: { deliveryCharge: charge, total, deliveryChargeStatus: "confirmed" },
    include: orderInclude,
  });
}

/** Free-text so the shop can note who's delivering without a staff table. */
async function assignDeliveryPerson(id, deliveryPersonName) {
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) throw notFoundError("Order not found.");

  return prisma.order.update({
    where: { id },
    data: {
      deliveryPersonName: deliveryPersonName ? deliveryPersonName.trim() : null,
      // A typed name is no longer tied to a rider account.
      deliveryAdminId: null,
      deliveryPersonPhone: null,
    },
    include: orderInclude,
  });
}

module.exports = {
  createOrder,
  listOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  previewCoupon,
  previewCheckout,
  getDashboardStats,
  createPublicOrder,
  getOrderForTracking,
  listCustomerOrders,
  getCustomerOrder,
  verifyPayment,
  verifyRazorpayPayment,
  markOrderPaidFromWebhook,
  setDeliveryCharge,
  assignDeliveryPerson,
  orderInclude,
};