import notifee, { AndroidImportance, AndroidVisibility } from '@notifee/react-native';
import { SIREN_CHANNEL_ID, SIREN_SOUND } from '../config';

/**
 * Creates the siren channel (safe to call again and again). Called when the app starts AND inside
 * the background handler right before an alarm is shown, so the channel always exists.
 *
 * Android never lets an app change a channel's sound after it was created. To change the siren later,
 * create a new channel id (orders_siren_v2) - do not edit this one.
 */
export async function ensureSirenChannel() {
  return notifee.createChannel({
    id: SIREN_CHANNEL_ID,
    name: 'New orders (siren)',
    description: 'Rings until someone taps Acknowledge',
    importance: AndroidImportance.HIGH,
    sound: SIREN_SOUND,
    vibration: true,
    vibrationPattern: [300, 600, 300, 600],
    visibility: AndroidVisibility.PUBLIC, // shown in full on the lock screen
    lights: true,
  });
}
