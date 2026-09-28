const categoriesService = require("../../services/categories/categories.service");
const productsService = require("../../services/products/products.service");
const ordersService = require("../../services/orders/orders.service");
const couponsService = require("../../services/coupons/coupons.service");
const merchService = require("../../services/merch/merch.service");
const combosService = require("../../services/combos/combos.service");
const recipesService = require("../../services/recipes/recipes.service");
const razorpayService = require("../../services/payments/razorpay.service");
const {
  validatePublicCreateOrder,
  validateRazorpayVerification,
} = require("../../validators/orders/orders.validator");
const { success, failure } = require("../../utils/apiResponse.util");

// No auth on any of these - this is the customer-facing read surface.
// Every function explicitly filters to active records only, regardless of
// what the underlying service defaults to, so a customer can never see
// something the admin has deactivated - even by guessing an id.

async function listCategories(req, res, next) {
  try {
    const categories = await categoriesService.listCategories({
      includeInactive: false,
      countAvailableOnly: true,
    });
    return success(res, 200, "Categories fetched.", { categories });
  } catch (err) {
    return next(err);
  }
}

async function listProducts(req, res, next) {
  try {
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
    const products = await productsService.listProducts({
      categoryId,
      includeInactive: false,
      inStockOnly: true,
      search: req.query.search,
    });
    // Only tags live right now, plus the automatic "Bestseller" label.
    // Combos with something unavailable inside drop out of the list, like a pulled item.
    const visible = combosService.toPublic(products, { hideUnavailable: true });
    return success(res, 200, "Products fetched.", { products: await merchService.decorateProducts(visible) });
  } catch (err) {
    return next(err);
  }
}

async function getProduct(req, res, next) {
  try {
    const product = await productsService.getProductById(Number(req.params.id));
    if (!product.isActive || !product.isInStock) {
      return failure(res, 404, "Product not found.");
    }
    const [decorated] = await merchService.decorateProducts(combosService.toPublic([product]));
    // Published recipes that use this product ("Is se banao").
    decorated.recipes = await recipesService.recipesForProduct(product.id).catch(() => []);
    return success(res, 200, "Product fetched.", { product: decorated });
  } catch (err) {
    if (err.expose) return failure(res, err.statusCode, err.message);
    return next(err);
  }
}

async function createOrder(req, res, next) {
  try {
    const { isValid, errors } = validatePublicCreateOrder(req.body);
    if (!isValid) return failure(res, 422, "Please check your order details.", errors);

    // req.customer is set by attachCustomerIfPresent when signed in, absent for guests.
    const { order, razorpayOrderId, razorpayKeyId, amount } =
      await ordersService.createPublicOrder(req.body, req.customer?.id ?? null);

    // For "cod", `order` is the real, already-created Order. For "razorpay",
    // nothing has been created yet - only a Razorpay order + a priced draft
    // (see createPublicOrder) - so `order` is null here and the frontend
    // works off razorpayOrderId/amount until payment actually succeeds.
    return success(res, 201, order ? "Order placed." : "Checkout ready for payment.", {
      order: order
        ? {
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            deliveryDate: order.deliveryDate,
            deliveryStartTime: order.deliveryStartTime,
            deliveryEndTime: order.deliveryEndTime,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            deliveryChargeStatus: order.deliveryChargeStatus,
            // Lets the customer see who is bringing the order once it is out for delivery.
            deliveryPersonName: order.deliveryPersonName,
            subtotal: order.subtotal,
            deliveryCharge: order.deliveryCharge,
            discount: order.discount,
            couponCode: order.couponCode,
            freeDelivery: order.freeDelivery,
            total: order.total,
            status: order.status,
            items: order.items,
          }
        : null,
      razorpayOrderId: razorpayOrderId || undefined,
      razorpayKeyId: razorpayKeyId || undefined,
      amount: amount || undefined,
    });
  } catch (err) {
    if (err.expose) return failure(res, err.statusCode, err.message);
    return next(err);
  }
}

/** Called by the checkout page right after Razorpay's widget reports success. */
async function verifyRazorpayPayment(req, res, next) {
  try {
    const { isValid, errors } = validateRazorpayVerification(req.body);
    if (!isValid) return failure(res, 422, "Missing payment details.", errors);

    const order = await ordersService.verifyRazorpayPayment(req.body);

    return success(res, 200, "Payment verified.", {
      order: {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        deliveryDate: order.deliveryDate,
        deliveryStartTime: order.deliveryStartTime,
        deliveryEndTime: order.deliveryEndTime,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        deliveryChargeStatus: order.deliveryChargeStatus,
        deliveryPersonName: order.deliveryPersonName,
        subtotal: order.subtotal,
        deliveryCharge: order.deliveryCharge,
        discount: order.discount,
        couponCode: order.couponCode,
        freeDelivery: order.freeDelivery,
        total: order.total,
        status: order.status,
        items: order.items,
      },
    });
  } catch (err) {
    if (err.expose) return failure(res, err.statusCode, err.message);
    return next(err);
  }
}

/**
 * Razorpay calls this directly (not the browser) - it's a safety net for a
 * customer whose browser closed right after paying, before the widget's own
 * success callback could run. Always answers 200 once the signature check is
 * done, because a non-200 makes Razorpay retry the same event repeatedly.
 */
async function razorpayWebhook(req, res) {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const isValid = razorpayService.verifyWebhookSignature({ rawBody: req.rawBody, signature });
    if (!isValid) {
      return res.status(400).json({ success: false, message: "Invalid webhook signature." });
    }

    const event = req.body;
    if (event.event === "payment.captured" || event.event === "order.paid") {
      const payment = event.payload?.payment?.entity;
      if (payment?.order_id && payment?.id) {
        await ordersService.markOrderPaidFromWebhook({
          razorpayOrderId: payment.order_id,
          razorpayPaymentId: payment.id,
        });
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    // Log-and-200: Razorpay's retry-on-failure makes a 5xx here worse, not
    // better - the widget-driven verify call is the primary path anyway.
    // eslint-disable-next-line no-console
    console.error("Razorpay webhook error:", err);
    return res.status(200).json({ success: false });
  }
}

async function trackOrder(req, res, next) {
  try {
    const { orderNumber, phone } = req.query;
    if (!orderNumber || !phone) {
      return failure(res, 422, "Order number and phone number are both required.");
    }

    const order = await ordersService.getOrderForTracking(orderNumber, phone);

    return success(res, 200, "Order found.", {
      order: {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        deliveryDate: order.deliveryDate,
        deliveryStartTime: order.deliveryStartTime,
        deliveryEndTime: order.deliveryEndTime,
        deliveryAddress: order.deliveryAddress,
        deliveryChargeStatus: order.deliveryChargeStatus,
        // Lets the customer see who is bringing the order once it is out for delivery.
        deliveryPersonName: order.deliveryPersonName,
        subtotal: order.subtotal,
        deliveryCharge: order.deliveryCharge,
        discount: order.discount,
        couponCode: order.couponCode,
        freeDelivery: order.freeDelivery,
        total: order.total,
        createdAt: order.createdAt,
        items: order.items,
      },
    });
  } catch (err) {
    if (err.expose) return failure(res, err.statusCode, err.message);
    return next(err);
  }
}

/** Everything the customer needs about an order, nothing internal. */
function toCustomerOrderView(order) {
  return {
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    deliveryDate: order.deliveryDate,
    deliveryStartTime: order.deliveryStartTime,
    deliveryEndTime: order.deliveryEndTime,
    deliveryAddress: order.deliveryAddress,
    deliveryChargeStatus: order.deliveryChargeStatus,
    // Lets the customer see who is bringing the order once it is out for delivery.
    deliveryPersonName: order.deliveryPersonName,
    subtotal: order.subtotal,
    deliveryCharge: order.deliveryCharge,
    discount: order.discount,
    couponCode: order.couponCode,
    freeDelivery: order.freeDelivery,
    total: order.total,
    createdAt: order.createdAt,
    items: order.items,
  };
}

async function myOrders(req, res, next) {
  try {
    const page = req.query.page ? Number(req.query.page) : 1;
    const result = await ordersService.listCustomerOrders(req.customer.id, { page });
    return success(res, 200, "Orders fetched.", {
      ...result,
      orders: result.orders.map(toCustomerOrderView),
    });
  } catch (err) {
    return next(err);
  }
}

async function myOrderDetail(req, res, next) {
  try {
    const order = await ordersService.getCustomerOrder(req.customer.id, req.params.orderNumber);
    return success(res, 200, "Order fetched.", { order: toCustomerOrderView(order) });
  } catch (err) {
    if (err.expose) return failure(res, err.statusCode, err.message);
    return next(err);
  }
}

/** Coupons marked "show on site" that work right now - the cart's "Available offers". */
async function listCoupons(req, res, next) {
  try {
    const coupons = await couponsService.listPublicCoupons();
    return success(res, 200, "Coupons fetched.", { coupons });
  } catch (err) {
    return next(err);
  }
}

/**
 * Checks a code against the cart and returns what it would save. Nothing is
 * reserved; the order itself checks again. Signed-in customers' phone numbers
 * are used for "once per customer" / "first order" rules automatically.
 */
async function applyCoupon(req, res, next) {
  try {
    const { code, items, customerPhone } = req.body || {};
    if (typeof code !== "string" || !code.trim() || code.trim().length > 30) {
      return failure(res, 422, "Enter a coupon code.");
    }
    const validItems =
      Array.isArray(items) &&
      items.length > 0 &&
      items.length <= 100 &&
      items.every((i) => Number.isInteger(i?.productVariantId) && Number.isInteger(i?.quantity) && i.quantity > 0);
    if (!validItems) return failure(res, 422, "Your cart is empty.");

    const preview = await ordersService.previewCoupon({
      code,
      items,
      customerPhone: req.customer?.phone || (typeof customerPhone === "string" ? customerPhone : undefined),
    });
    return success(res, 200, `Coupon applied - you save ₹${Math.round(preview.savings)}.`, { coupon: preview });
  } catch (err) {
    if (err.expose) return failure(res, err.statusCode, err.message);
    return next(err);
  }
}

module.exports = {
  listCoupons,
  applyCoupon,
  listCategories,
  listProducts,
  getProduct,
  createOrder,
  verifyRazorpayPayment,
  razorpayWebhook,
  trackOrder,
  myOrders,
  myOrderDetail,
};