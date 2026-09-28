/**
 * Third-party scripts loaded only when they are needed, instead of on every
 * page from index.html:
 *  - MSG91 OTP widget  -> when the login sheet opens
 *  - Razorpay checkout -> when the checkout page opens
 * Each loads once per page visit; later calls reuse the same promise.
 */

const cache = new Map();

/** Loads the first URL that works (the rest are fallbacks). */
function loadScript(urls) {
  const key = urls.join("|");
  if (cache.has(key)) return cache.get(key);
  const promise = new Promise((resolve, reject) => {
    let i = 0;
    function attempt() {
      const s = document.createElement("script");
      s.src = urls[i];
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        s.remove();
        i += 1;
        if (i < urls.length) attempt();
        else reject(new Error(`Couldn't load ${urls[0]}`));
      };
      document.head.appendChild(s);
    }
    attempt();
  });
  // A failed load may succeed later (flaky mobile data) - don't cache failures.
  promise.catch(() => cache.delete(key));
  cache.set(key, promise);
  return promise;
}

/** Resolves once `check()` is true, polling briefly; rejects after `timeoutMs`. */
function waitFor(check, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    (function poll() {
      if (check()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error("Timed out"));
      setTimeout(poll, 100);
    })();
  });
}

let msg91Promise = null;

/**
 * MSG91 OTP widget with exposeMethods, so LoginSheet can call
 * window.sendOtp / verifyOtp / retryOtp from its own form.
 */
export function loadMsg91Widget() {
  if (typeof window.sendOtp === "function") return Promise.resolve();
  if (msg91Promise) return msg91Promise;
  msg91Promise = loadScript(["https://verify.msg91.com/otp-provider.js", "https://verify.phone91.com/otp-provider.js"])
    .then(() => {
      if (typeof window.sendOtp !== "function" && typeof window.initSendOTP === "function") {
        window.initSendOTP({
          widgetId: import.meta.env.VITE_MSG91_WIDGET_ID,
          tokenAuth: import.meta.env.VITE_MSG91_TOKEN_AUTH,
          exposeMethods: true,
          success: () => {}, // unused - LoginSheet passes its own callbacks
          failure: () => {},
        });
      }
      return waitFor(() => typeof window.sendOtp === "function");
    })
    .catch((err) => {
      msg91Promise = null; // allow a retry
      throw err;
    });
  return msg91Promise;
}

/** Razorpay's checkout widget (window.Razorpay). */
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  return loadScript(["https://checkout.razorpay.com/v1/checkout.js"]).then(() =>
    waitFor(() => Boolean(window.Razorpay), 5000)
  );
}
