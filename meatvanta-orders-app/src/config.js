// Where the app talks to.
//
// Debug builds use localhost. With the phone on USB (or an emulator) run once:
//     adb reverse tcp:4000 tcp:4000
// and the phone's "localhost:4000" reaches the backend running on this PC.
// Release builds always use the live HTTPS API.
export const API_BASE_URL = __DEV__ ? 'http://localhost:4000/api/app' : 'https://api.meatvanta.com/api/app';

// Notification channel for the siren. Android freezes a channel's sound once it exists, so to change
// the sound later make a NEW id (orders_siren_v2) - never edit this one.
export const SIREN_CHANNEL_ID = 'orders_siren_v1';
export const SIREN_SOUND = 'siren'; // android/app/src/main/res/raw/siren.wav, no extension

export const KEYCHAIN_SERVICE = 'meatvanta-orders';
