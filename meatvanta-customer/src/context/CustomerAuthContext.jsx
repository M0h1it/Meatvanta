import { createContext, useEffect, useState, useCallback } from "react";
import {
  verifyOtp as verifyOtpApi,
  fetchCurrentCustomer,
  logoutRequest,
} from "../features/auth/api/authApi";
import { fetchAddresses } from "../features/account/api/addressesApi";
import { setSessionExpiredHandler } from "../lib/apiClient";

export const CustomerAuthContext = createContext(null);

export function CustomerAuthProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // The login sheet is global so any page ("Place Order", "My Orders") can open it.
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [afterLoginAction, setAfterLoginAction] = useState(null);

  // The /me endpoint (fetchCurrentCustomer) doesn't reliably include
  // addresses, but the header's delivery-address strip needs them - so
  // every time we load or refresh the customer, addresses are fetched
  // separately and merged in. Without this, the header can show "Add a
  // delivery address" even when one exists, until something else (like
  // visiting the Account page) happens to trigger a refresh.
  async function withAddresses(customerData) {
    if (!customerData) return customerData;
    try {
      const addresses = await fetchAddresses();
      return { ...customerData, addresses };
    } catch {
      return customerData; // keep whatever /me already gave us
    }
  }

  useEffect(() => {
    // When a refresh finally fails, drop the customer from state so the UI
    // switches back to signed-out rather than showing a stale name.
    setSessionExpiredHandler(() => setCustomer(null));

    fetchCurrentCustomer()
      .then(async (data) => setCustomer(await withAddresses(data)))
      .catch(() => setCustomer(null)) // 401 here just means "guest"
      .finally(() => setIsLoading(false));
  }, []);

  const openLogin = useCallback((onSuccess = null) => {
    setAfterLoginAction(() => onSuccess);
    setIsLoginOpen(true);
  }, []);

  const closeLogin = useCallback(() => {
    setIsLoginOpen(false);
    setAfterLoginAction(null);
  }, []);

  const verifyOtp = useCallback(
    async ({ accessToken, signupToken, name }) => {
      const result = await verifyOtpApi({ accessToken, signupToken, name });
      const withAddr = await withAddresses(result.customer);
      setCustomer(withAddr);
      setIsLoginOpen(false);

      // Run whatever the customer was trying to do before login interrupted them.
      if (afterLoginAction) {
        const action = afterLoginAction;
        setAfterLoginAction(null);
        action(withAddr);
      }
      return { ...result, customer: withAddr };
    },
    [afterLoginAction]
  );

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setCustomer(null); // clear locally even if the network call failed
    }
  }, []);

  /** Called after address changes so the header reflects them without a reload. */
  const refreshCustomer = useCallback(async () => {
    try {
      const fresh = await withAddresses(await fetchCurrentCustomer());
      setCustomer(fresh);
      return fresh;
    } catch {
      return null;
    }
  }, []);

  const defaultAddress = customer?.addresses?.find((a) => a.isDefault) || customer?.addresses?.[0] || null;

  const value = {
    customer,
    defaultAddress,
    isAuthenticated: !!customer,
    isLoading,
    isLoginOpen,
    openLogin,
    closeLogin,
    verifyOtp,
    logout,
    refreshCustomer,
  };

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}