import { useState, useEffect, useRef } from "react";
import { useCustomerAuth } from "../../../hooks/useCustomerAuth";
import BrandLogo from "../../../components/common/BrandLogo";
import { loadMsg91Widget } from "../../../lib/externalScripts";

const STEPS = { PHONE: "phone", OTP: "otp" };

const FEATURES = [
  { icon: "eco", title: "Fresh Meat" },
  { icon: "content_cut", title: "Daily Cut" },
  { icon: "ac_unit", title: "No Frozen" },
  { icon: "verified", title: "Halal Certified" },
];

export default function LoginSheet() {
  const { isLoginOpen, closeLogin, verifyOtp } = useCustomerAuth();

  const [step, setStep] = useState(STEPS.PHONE);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [needsName, setNeedsName] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // MSG91 widget's own request id for this OTP session - some widget
  // configs need it passed back into verifyOtp/retryOtp, harmless to send
  // if not required.
  const reqIdRef = useRef(null);
  // The access-token MSG91 hands back once the code is confirmed - this is
  // what our backend actually checks (see authApi.verifyOtp), not the raw
  // 6-digit code.
  const accessTokenRef = useRef(null);
  // Handed back by our backend when MSG91 confirmed a number that has no
  // account yet. MSG91's access-token works only once, so the "enter your
  // name" step sends this instead of asking MSG91 to verify the code again.
  const signupTokenRef = useRef(null);

  const otpInputRef = useRef(null);

  // Reset everything when the sheet closes so the next open starts clean.
  useEffect(() => {
    if (!isLoginOpen) {
      setStep(STEPS.PHONE);
      setPhone("");
      setOtp("");
      setName("");
      setNeedsName(false);
      setError(null);
      setResendIn(0);
      reqIdRef.current = null;
      accessTokenRef.current = null;
      signupTokenRef.current = null;
    }
  }, [isLoginOpen]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  useEffect(() => {
    if (step === STEPS.OTP && otpInputRef.current) otpInputRef.current.focus();
  }, [step]);

  // The MSG91 widget is loaded only when the sheet opens (not on every page).
  // Started right away so it's usually ready before the number is typed.
  // A failure here is handled on "Send Code", which tries again.
  useEffect(() => {
    if (isLoginOpen) loadMsg91Widget().catch(() => {});
  }, [isLoginOpen]);

  useEffect(() => {
    if (!isLoginOpen) return;
    function onKeyDown(e) {
      if (e.key === "Escape") closeLogin();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [isLoginOpen, closeLogin]);

  if (!isLoginOpen) return null;

  /**
   * Sends the OTP via the MSG91 widget - straight from the browser to
   * MSG91's servers, our backend is never involved in this step. Requires
   * window.sendOtp, which the widget script in index.html exposes once it
   * finishes loading (exposeMethods: true).
   */
  async function handleSendOtp(e) {
    e?.preventDefault();
    setError(null);
    setIsSubmitting(true);

    if (typeof window.sendOtp !== "function") {
      try {
        await loadMsg91Widget(); // still loading, or failed earlier - try (again) now
      } catch {
        setError("Couldn't load the verification service. Please check your connection and try again.");
        setIsSubmitting(false);
        return;
      }
    }

    window.sendOtp(
      `91${phone}`,
      (data) => {
        reqIdRef.current = data?.message || data?.reqId || null;
        setStep(STEPS.OTP);
        setResendIn(60);
        setIsSubmitting(false);
      },
      (err) => {
        setError(err?.message || "Couldn't send the code. Please try again.");
        setIsSubmitting(false);
      }
    );
  }

  /**
   * Asks MSG91 to check the code the customer typed. Only on MSG91's own
   * success do we get an access-token - THAT is what goes to our backend
   * (see handleVerify below), which re-confirms it server-side before
   * treating anyone as logged in.
   */
  function handleVerify(e) {
    e.preventDefault();
    setError(null);

    // Second step for a new customer: the code was already confirmed, so do NOT
    // send it to MSG91 again (it would answer "otp already verified"). The
    // backend gets its own signup token plus the name instead.
    if (needsName && signupTokenRef.current) {
      submitSignupWithName();
      return;
    }

    if (typeof window.verifyOtp !== "function") {
      setError("Couldn't load the verification service. Please refresh and try again.");
      return;
    }

    setIsSubmitting(true);
    window.verifyOtp(
      otp,
      async (data) => {
        try {
          accessTokenRef.current = data?.message;
          await verifyOtp({ accessToken: accessTokenRef.current, name: needsName ? name : undefined });
          // Sheet closes itself on success via context.
        } catch (err) {
          const response = err.response?.data;
          // Backend tells us this number has no account yet and needs a name.
          if (response?.errors?.nameRequired) {
            signupTokenRef.current = response.errors.signupToken || null;
            setNeedsName(true);
            setError(null);
          } else {
            setError(response?.message || "Couldn't verify that code.");
          }
        } finally {
          setIsSubmitting(false);
        }
      },
      (err) => {
        setError(err?.message || "That code isn't correct.");
        setIsSubmitting(false);
      },
      reqIdRef.current || undefined
    );
  }

  /** Finishes signup for a new number: our signup token + the name, no MSG91 call. */
  async function submitSignupWithName() {
    setIsSubmitting(true);
    try {
      await verifyOtp({ signupToken: signupTokenRef.current, name });
      // Sheet closes itself on success via context.
    } catch (err) {
      const response = err.response?.data;
      if (response?.errors?.nameRequired) {
        // Name too short etc. - the backend issued a fresh token, keep going.
        signupTokenRef.current = response.errors.signupToken || signupTokenRef.current;
        setError("Please enter your name.");
      } else {
        // Most likely the 10-minute window passed - start over with a new code.
        setError(response?.message || "Couldn't finish signing up. Please try again.");
        if (response?.message?.includes("expired")) {
          signupTokenRef.current = null;
          setNeedsName(false);
          setOtp("");
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  /** Back to the number step with nothing left over from the previous attempt. */
  function handleChangeNumber() {
    setStep(STEPS.PHONE);
    setOtp("");
    setName("");
    setNeedsName(false);
    setError(null);
    setResendIn(0);
    reqIdRef.current = null;
    accessTokenRef.current = null;
    signupTokenRef.current = null;
  }

  /** Resends via the widget's own retry method rather than sending a second
   * fresh OTP request, so MSG91's own resend/cooldown rules apply. */
  function handleResend() {
    setError(null);
    if (typeof window.retryOtp !== "function") {
      handleSendOtp();
      return;
    }
    setIsSubmitting(true);
    window.retryOtp(
      11, // text SMS channel
      () => {
        setResendIn(60);
        setIsSubmitting(false);
      },
      (err) => {
        setError(err?.message || "Couldn't resend the code. Please try again.");
        setIsSubmitting(false);
      },
      reqIdRef.current || undefined
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 sm:p-6"
      onClick={closeLogin}
    >
      <div
        className="relative w-full sm:max-w-3xl bg-surface rounded-t-2xl sm:rounded overflow-hidden grid grid-cols-1 sm:grid-cols-2"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={closeLogin}
          className="absolute top-4 right-4 z-10 text-white sm:text-ink/40 sm:hover:text-ink"
          aria-label="Close"
        >
          <span className="material-symbols-outlined">close</span>
        </button>

        {/* Left brand panel - hidden on mobile, where this collapses to a
            single-column sheet instead of the mockup's full split layout.
            The hero-mobile photo is the actual background now (not a small
            thumbnail lower down); a gradient sits between it and the text
            so everything stays readable over the photo. */}
        <div className="relative hidden sm:flex flex-col justify-between p-8 text-white overflow-hidden">
          <img
            src="/hero-mobile.webp"
            loading="lazy"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Brand-tinted wash instead of a flat black one - a plain black
              overlay over a light/beige part of the photo just reads as
              grey, not on-brand. This keeps the red identity while still
              giving enough contrast for the white text. */}
          <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/85 via-brand-dark/55" />

          <div className="relative">
            <div className="flex items-center gap-2 mb-6">
              <BrandLogo variant="mark" className="h-9" />
              <span className="font-display text-xl font-bold">Meat Vanta</span>
            </div>
            <h2 className="font-display text-xl font-bold leading-tight">
              Fresh Meat. <span className="text-accent italic">Real Freshness.</span>
            </h2>
            <p className="text-white/70 text-sm mt-2">
              Sign in to continue your fresh meat journey with Meatvanta.
            </p>

            <div className="flex gap-5 mt-6">
              {FEATURES.map((f) => (
                <div key={f.title} className="flex flex-col items-center gap-1.5">
                  <span
                    className="material-symbols-outlined text-accent text-3xl"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {f.icon}
                  </span>
                  <span className="text-[10px] text-white/80 text-center leading-tight w-14">{f.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right form panel */}
        <div className="p-6 sm:p-8 pb-8">
          <h2 className="font-display text-xl font-bold text-ink mb-1">
            {step === STEPS.PHONE ? (
              <>
                Welcome <span className="text-brand">Back!</span>
              </>
            ) : needsName ? (
              "Almost there"
            ) : (
              "Enter the Code"
            )}
          </h2>
          <p className="text-ink/60 text-sm mb-5">
            {step === STEPS.PHONE
              ? "Log in to your account to order your favourite fresh meat."
              : `Sent to +91 ${phone}.`}
          </p>

          {step === STEPS.PHONE ? (
            <form onSubmit={handleSendOtp}>
              <label className="block text-sm font-semibold text-ink mb-1">Mobile Number</label>
              <div className="flex items-center rounded-sm border border-ink/15 bg-white overflow-hidden mb-1">
                <span className="px-3 text-sm font-semibold text-ink/50 border-r border-hairline py-3">
                  +91
                </span>
                <input
                  autoFocus
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  required
                  placeholder="10-digit number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  className="flex-1 px-3 py-3 text-sm focus:outline-none"
                />
              </div>
              <p className="text-xs text-ink/50 mb-1">We'll send a 6-digit code to confirm it's you.</p>

              {error && <p className="text-xs text-brand mt-2">{error}</p>}

              <button
                type="submit"
                disabled={isSubmitting || phone.length !== 10}
                className="w-full mt-5 bg-brand text-white font-bold py-3.5 rounded-full hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {isSubmitting ? "Sending..." : "Send Code"}
                {!isSubmitting && <span className="material-symbols-outlined text-lg">arrow_forward</span>}
              </button>

              {/* Visual-only, disabled - this shop only supports phone + OTP today */}
              <div className="flex items-center gap-3 my-4">
                <span className="flex-1 h-px bg-hairline" />
                <span className="text-xs text-ink/40">OR</span>
                <span className="flex-1 h-px bg-hairline" />
              </div>
              <div className="space-y-2" title="Coming soon">
                <button
                  type="button"
                  disabled
                  className="w-full flex items-center justify-center gap-2 border border-ink/15 rounded-sm py-3 text-sm font-semibold text-ink/40 bg-surface-alt cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-base">mail</span>
                  Continue with Google
                </button>
                <button
                  type="button"
                  disabled
                  className="w-full flex items-center justify-center gap-2 border border-ink/15 rounded-sm py-3 text-sm font-semibold text-ink/40 bg-surface-alt cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-base">phone_iphone</span>
                  Continue with Apple
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerify}>
              <button
                type="button"
                onClick={handleChangeNumber}
                className="text-brand-dark text-sm font-semibold underline mb-4"
              >
                Change number
              </button>

              {/* MSG91's widget decides the OTP length (Widget Settings on
                  their dashboard - commonly 4 digits, sometimes 6), not us -
                  so this accepts anything in that range rather than assuming
                  a fixed length. */}
              <label className="block text-sm font-semibold text-ink mb-1">Verification Code</label>
              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                placeholder="Enter code"
                value={otp}
                // Already confirmed once the name is asked for - locked so it
                // can't be edited into something that no longer matches.
                readOnly={needsName}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className={`w-full rounded-sm border border-ink/15 px-4 py-3 text-center text-lg font-bold tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-brand-dark ${
                  needsName ? "bg-surface-alt text-ink/60" : "bg-white"
                }`}
              />

              {needsName && (
                <div className="mt-4">
                  <label className="block text-sm font-semibold text-ink mb-1">Your Name</label>
                  <input
                    autoFocus
                    required
                    placeholder="So we know who's ordering"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-sm border border-ink/15 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-dark"
                  />
                  <p className="text-xs text-ink/50 mt-1">First time here — welcome!</p>
                </div>
              )}

              {error && <p className="text-xs text-brand mt-2">{error}</p>}

              <button
                type="submit"
                disabled={isSubmitting || otp.length < 4 || (needsName && name.trim().length < 2)}
                className="w-full mt-5 bg-brand text-white font-bold py-3.5 rounded-full hover:opacity-90 disabled:opacity-40"
              >
                {isSubmitting ? "Verifying..." : needsName ? "Create Account" : "Login"}
              </button>

              {/* Nothing to resend once the code has been accepted */}
              <button
                type="button"
                hidden={needsName}
                disabled={resendIn > 0 || isSubmitting}
                onClick={handleResend}
                className="w-full mt-3 text-sm font-semibold text-ink/60 disabled:opacity-50"
              >
                {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}