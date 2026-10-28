import { getApps } from '@react-native-firebase/app';
import {
  getMessaging,
  getToken,
  onMessage,
  onTokenRefresh,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import { handleRemoteMessage } from './handlers';
import { putFcmToken } from '../api/endpoints';

// Push only exists once android/app/google-services.json is in place. Without it Firebase has no
// app, so every function here quietly does nothing - the rest of the app keeps working.
export function isPushAvailable() {
  try {
    return getApps().length > 0;
  } catch {
    return false;
  }
}

/** Called once from index.js - the handler that runs when a push arrives and the app is closed. */
export function registerBackgroundMessageHandler() {
  if (!isPushAvailable()) return;
  setBackgroundMessageHandler(getMessaging(), handleRemoteMessage);
}

/** Push while the app is open. Returns the unsubscribe function. */
export function subscribeToForegroundMessages() {
  if (!isPushAvailable()) return () => {};
  return onMessage(getMessaging(), handleRemoteMessage);
}

/** This phone's push address (null when push is not set up). */
export async function currentFcmToken() {
  if (!isPushAvailable()) return null;
  try {
    return await getToken(getMessaging());
  } catch (error) {
    console.warn('[fcm] could not get a token:', error?.message);
    return null;
  }
}

/** Sends the push address to the backend (after login and whenever Firebase renews it). */
export async function syncFcmToken() {
  const token = await currentFcmToken();
  if (!token) return;
  try {
    await putFcmToken(token);
  } catch (error) {
    console.warn('[fcm] could not save the token:', error?.message);
  }
}

/** Keeps the backend's copy fresh when Firebase hands out a new token. Returns unsubscribe. */
export function subscribeToTokenRefresh() {
  if (!isPushAvailable()) return () => {};
  return onTokenRefresh(getMessaging(), async (token) => {
    try {
      await putFcmToken(token);
    } catch (error) {
      console.warn('[fcm] could not save the refreshed token:', error?.message);
    }
  });
}
