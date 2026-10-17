import axios from "axios";
import { noteServerTime } from "./serverClock";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/public";

// withCredentials so the httpOnly session cookies ride along. The browser
// holds the tokens; JS never sees them.
const apiClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Bare client for the refresh call itself - using apiClient would re-enter the
// interceptor and loop if the refresh also 401s.
const refreshClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Endpoints where a 401 is a normal answer ("you're a guest"), not a signal to
// refresh. Retrying these would cause a pointless refresh on every page load.
const NO_REFRESH_PATHS = ["/auth/refresh", "/auth/login", "/auth/verify-otp", "/auth/logout"];

let isRefreshing = false;
let queuedRequests = [];

function flushQueue(error) {
  queuedRequests.forEach(({ resolve, reject }) => (error ? reject(error) : resolve()));
  queuedRequests = [];
}

let onSessionExpired = null;
/** Lets CustomerAuthContext clear its state when a refresh finally fails. */
export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

apiClient.interceptors.response.use(
  (response) => {
    // Keep the shop server's clock in sync (used to end offers at the exact second).
    noteServerTime(response.data?.serverTime);
    return response;
  },
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    const isRefreshable =
      status === 401 &&
      original &&
      !original._retried &&
      !NO_REFRESH_PATHS.some((path) => original.url?.startsWith(path));

    if (!isRefreshable) return Promise.reject(error);

    original._retried = true;

    // A refresh is already in flight - wait for it rather than firing several.
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        queuedRequests.push({
          resolve: () => resolve(apiClient(original)),
          reject,
        });
      });
    }

    isRefreshing = true;
    try {
      await refreshClient.post("/auth/refresh");
      flushQueue(null);
      return apiClient(original); // replay the original request with fresh cookies
    } catch (refreshError) {
      flushQueue(refreshError);
      if (onSessionExpired) onSessionExpired();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default apiClient;
