const ORDER_STATUSES = ["placed", "preparing", "out_for_delivery", "delivered", "cancelled"];
// "upi" is kept only for staff-entered phone orders (admin's own order-entry
// screen) and for reading old order history - it is no longer offered on the
// customer-facing checkout, see CUSTOMER_PAYMENT_METHODS below.
const PAYMENT_METHODS = ["cod", "upi", "razorpay"];
// What a customer placing an order online may actually choose.
const CUSTOMER_PAYMENT_METHODS = ["cod", "razorpay"];
const PAYMENT_STATUSES = ["unpaid", "submitted", "verified", "rejected", "pending", "paid", "failed"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// What each status is allowed to move to next - keeps the workflow linear
// and stops something delivered from being bounced back to "placed".
const ALLOWED_TRANSITIONS = {
  placed: ["preparing", "cancelled"],
  preparing: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
};

function isPositiveInteger(val) {
  return Number.isInteger(val) && val > 0;
}
function isNonNegativeNumber(val) {
  return typeof val === "number" && !Number.isNaN(val) && val >= 0;
}

function validateCreateOrder(body) {
  const errors = {};
  const { customerName, customerPhone, items, deliveryCharge, discount, paymentMethod } = body || {};

  if (!customerName || typeof customerName !== "string" || customerName.trim().length < 2) {
    errors.customerName = "Customer name is required.";
  }
  if (!customerPhone || typeof customerPhone !== "string" || customerPhone.trim().length < 6) {
    errors.customerPhone = "A valid phone number is required.";
  }
  if (!Array.isArray(items) || items.length === 0) {
    errors.items = "At least one order item is required.";
  } else {
    const itemErrors = items
      .map((item, i) => {
        if (!item.productVariantId || typeof item.productVariantId !== "number") {
          return `Item ${i + 1}: productVariantId is required.`;
        }
        if (!isPositiveInteger(item.quantity)) {
          return `Item ${i + 1}: quantity must be a positive whole number.`;
        }
        return null;
      })
      .filter(Boolean);
    if (itemErrors.length > 0) errors.itemDetails = itemErrors;
  }
  if (deliveryCharge !== undefined && !isNonNegativeNumber(deliveryCharge)) {
    errors.deliveryCharge = "deliveryCharge must be a non-negative number.";
  }
  if (discount !== undefined && !isNonNegativeNumber(discount)) {
    errors.discount = "discount must be a non-negative number.";
  }
  if (paymentMethod !== undefined && !PAYMENT_METHODS.includes(paymentMethod)) {
    errors.paymentMethod = `paymentMethod must be one of: ${PAYMENT_METHODS.join(", ")}`;
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

function validateStatusUpdate(currentStatus, requestedStatus) {
  if (!ORDER_STATUSES.includes(requestedStatus)) {
    return `status must be one of: ${ORDER_STATUSES.join(", ")}`;
  }
  const allowedNext = ALLOWED_TRANSITIONS[currentStatus] || [];
  if (!allowedNext.includes(requestedStatus)) {
    return `Cannot move an order from "${currentStatus}" to "${requestedStatus}".`;
  }
  return null;
}

/**
 * Customer-site order submission. Stricter than the admin's version: address
 * and delivery date are required (staff taking a phone order may skip them).
 * Payment is either "cod" or "razorpay" - manual UPI proof-paste is no longer
 * offered here (see CUSTOMER_PAYMENT_METHODS).
 */
function validatePublicCreateOrder(body) {
  const errors = {};
  const { customerName, customerPhone, deliveryAddress, deliveryDate, items, paymentMethod } = body || {};

  if (!customerName || typeof customerName !== "string" || customerName.trim().length < 2) {
    errors.customerName = "Please enter your name.";
  }
  if (!customerPhone || typeof customerPhone !== "string" || !/^[0-9+\-\s]{10,15}$/.test(customerPhone.trim())) {
    errors.customerPhone = "Please enter a valid phone number.";
  }
  if (!deliveryAddress || typeof deliveryAddress !== "string" || deliveryAddress.trim().length < 10) {
    errors.deliveryAddress = "Please enter your full delivery address.";
  }
  if (!deliveryDate || !DATE_PATTERN.test(deliveryDate)) {
    errors.deliveryDate = "Please choose a delivery date.";
  }
  if (!Array.isArray(items) || items.length === 0) {
    errors.items = "Your cart is empty.";
  } else {
    const itemErrors = items
      .map((item, i) => {
        if (!item.productVariantId || typeof item.productVariantId !== "number") {
          return `Item ${i + 1}: invalid product.`;
        }
        if (!isPositiveInteger(item.quantity)) {
          return `Item ${i + 1}: quantity must be a positive whole number.`;
        }
        return null;
      })
      .filter(Boolean);
    if (itemErrors.length > 0) errors.itemDetails = itemErrors;
  }
  if (!CUSTOMER_PAYMENT_METHODS.includes(paymentMethod)) {
    errors.paymentMethod = `Please choose a payment method (${CUSTOMER_PAYMENT_METHODS.join(" or ")}).`;
  }
  // Optional. Only the code is accepted - the discount is always worked out on the server.
  const { couponCode } = body || {};
  if (couponCode !== undefined && couponCode !== null && couponCode !== "") {
    if (typeof couponCode !== "string" || couponCode.trim().length > 30) {
      errors.couponCode = "That coupon code doesn't look right.";
    }
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

/** Admin confirming/rejecting a legacy manual-UPI (phone order) payment. */
function validatePaymentVerification(body) {
  const errors = {};
  const { paymentStatus, paymentNote } = body || {};

  if (!["verified", "rejected"].includes(paymentStatus)) {
    errors.paymentStatus = 'paymentStatus must be "verified" or "rejected".';
  }
  if (paymentNote !== undefined && (typeof paymentNote !== "string" || paymentNote.length > 255)) {
    errors.paymentNote = "Note must be 255 characters or fewer.";
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

/** What the browser hands back after Razorpay's checkout widget succeeds. */
function validateRazorpayVerification(body) {
  const errors = {};
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = body || {};

  if (!razorpayOrderId || typeof razorpayOrderId !== "string") {
    errors.razorpayOrderId = "razorpayOrderId is required.";
  }
  if (!razorpayPaymentId || typeof razorpayPaymentId !== "string") {
    errors.razorpayPaymentId = "razorpayPaymentId is required.";
  }
  if (!razorpaySignature || typeof razorpaySignature !== "string") {
    errors.razorpaySignature = "razorpaySignature is required.";
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

module.exports = {
  ORDER_STATUSES,
  PAYMENT_METHODS,
  CUSTOMER_PAYMENT_METHODS,
  PAYMENT_STATUSES,
  ALLOWED_TRANSITIONS,
  validateCreateOrder,
  validateStatusUpdate,
  validatePublicCreateOrder,
  validatePaymentVerification,
  validateRazorpayVerification,
};
