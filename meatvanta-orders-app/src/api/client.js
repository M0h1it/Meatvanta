import axios from 'axios';
import { API_BASE_URL } from '../config';
import { getToken } from '../auth/storage';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Every request carries the bearer token. Read fresh each time, so it also works from the
// background handlers (no React state needed).
client.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A 401 on a signed-in request means the session is over (logged out elsewhere, account switched
// off, permission removed). AuthContext registers what to do about it.
let onUnauthorized = null;
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    if (error.response?.status === 401 && !url.includes('/auth/login') && onUnauthorized) {
      onUnauthorized();
    }
    return Promise.reject(error);
  },
);

/** The server's own message when there is one, else a plain fallback. */
export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.code === 'ECONNABORTED' || error.message === 'Network Error') {
    return 'Cannot reach the server. Check the internet connection.';
  }
  return fallback;
}

export default client;
