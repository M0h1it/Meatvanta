import * as Keychain from 'react-native-keychain';
import { KEYCHAIN_SERVICE } from '../config';

// The app's login token lives in the Android Keystore-backed secure storage - never in plain
// storage. The background handlers read it from here too (they have no React state).

// The account's mode ('admin' | 'rider') is kept as the "username" next to the token, so a phone that
// starts offline still opens the right half of the app.
export async function saveToken(token, mode = 'admin') {
  await Keychain.setGenericPassword(mode === 'rider' ? 'rider' : 'admin', token, { service: KEYCHAIN_SERVICE });
}

export async function getSavedMode() {
  try {
    const credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
    return credentials && credentials.username === 'rider' ? 'rider' : 'admin';
  } catch {
    return 'admin';
  }
}

export async function getToken() {
  try {
    const credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
    return credentials ? credentials.password : null;
  } catch {
    return null;
  }
}

export async function clearToken() {
  try {
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
  } catch {
    // nothing stored - fine
  }
}
