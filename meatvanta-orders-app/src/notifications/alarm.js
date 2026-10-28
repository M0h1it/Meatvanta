import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidStyle,
  AndroidVisibility,
} from '@notifee/react-native';
import { SIREN_CHANNEL_ID } from '../config';
import { ensureSirenChannel } from './channel';
import { colors } from '../theme';

const notificationIdFor = (orderId) => `order-${orderId}`;

/**
 * Rings the siren for a new order. One notification per order (id "order-<id>"), so a re-ring
 * from the server REPLACES the old one instead of stacking up.
 *
 *  - loopSound + ongoing: it keeps ringing and cannot be swiped away, until Acknowledge.
 *  - fullScreenAction: when the phone is locked it opens the app over the lock screen.
 *  - "Acknowledge" button (pressAction id "ack") works from the notification itself, even if the
 *    app was killed - see handlers.js.
 *
 * `data` is the push's data block: { orderId, orderNumber, total, itemsSummary }.
 */
export async function showOrderAlarm(data) {
  await ensureSirenChannel();

  const title = `New order ${data.orderNumber} · ₹${data.total}`;
  const items = data.itemsSummary || '';

  await notifee.displayNotification({
    id: notificationIdFor(data.orderId),
    title,
    body: items,
    data: { type: 'new_order', orderId: String(data.orderId) },
    android: {
      channelId: SIREN_CHANNEL_ID,
      category: AndroidCategory.ALARM,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      loopSound: true,
      ongoing: true,
      autoCancel: false,
      color: colors.brand,
      style: { type: AndroidStyle.BIGTEXT, text: items },
      fullScreenAction: { id: 'default' },
      pressAction: { id: 'default' },
      actions: [{ title: 'Acknowledge', pressAction: { id: 'ack' } }],
    },
  });
}

/** Stops the siren for one order (this phone). */
export async function stopOrderAlarm(orderId) {
  await notifee.cancelNotification(notificationIdFor(orderId));
}

export { notificationIdFor };
