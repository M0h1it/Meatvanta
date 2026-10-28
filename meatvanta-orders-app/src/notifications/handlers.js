import { DeviceEventEmitter } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import { showOrderAlarm, stopOrderAlarm } from './alarm';
import { acknowledge } from '../api/endpoints';

// NOTE: everything in this file also runs while the app is closed / the phone is locked, with no
// screen and no React. So nothing here may use React state or context - only the keychain token
// (through the axios client) and plain functions.

export const ORDERS_CHANGED = 'orders:changed';
export const TEST_ORDER_ID = 'test';

/** A push arrived (foreground: onMessage, background: setBackgroundMessageHandler). */
export async function handleRemoteMessage(remoteMessage) {
  const data = remoteMessage?.data || {};
  if (data.type === 'new_order') {
    await showOrderAlarm(data);
    DeviceEventEmitter.emit(ORDERS_CHANGED); // refreshes the list if the app is open
  } else if (data.type === 'order_ack') {
    // Someone on another phone tapped "Seen it" - stop ringing here too.
    await stopOrderAlarm(data.orderId);
    DeviceEventEmitter.emit(ORDERS_CHANGED);
  }
}

/**
 * "Acknowledge" tapped on the notification (or in the app). The siren is ALWAYS stopped on this phone,
 * even if the server could not be reached - nobody should have to listen to it because of bad signal.
 * If the call fails the order simply stays "not seen" on the server, so it still shows in the New
 * list with its red flag and the person can tap Acknowledge again.
 */
export async function acknowledgeOrder(orderId) {
  try {
    if (String(orderId) !== TEST_ORDER_ID) await acknowledge(orderId);
  } catch (error) {
    console.warn('[ack] could not reach the server:', error?.message);
  } finally {
    await stopOrderAlarm(orderId);
    DeviceEventEmitter.emit(ORDERS_CHANGED);
  }
}

/** Notification button / tap events (background and foreground share this). */
export async function handleNotifeeEvent({ type, detail }) {
  const orderId = detail?.notification?.data?.orderId;
  if (type === EventType.ACTION_PRESS && detail?.pressAction?.id === 'ack' && orderId) {
    await acknowledgeOrder(orderId);
  }
}

/** Foreground only: a tap on the notification opens that order. `open(orderId)` is given by App.js. */
export function subscribeToNotificationTaps(open) {
  return notifee.onForegroundEvent(async (event) => {
    await handleNotifeeEvent(event);
    const orderId = event.detail?.notification?.data?.orderId;
    if (event.type === EventType.PRESS && orderId && orderId !== TEST_ORDER_ID) open(orderId);
  });
}
