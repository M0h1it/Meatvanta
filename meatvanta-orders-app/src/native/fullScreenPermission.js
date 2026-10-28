import { Linking, NativeModules } from 'react-native';

// Android 14+ "full-screen notifications" switch. Backed by FullScreenPermissionModule.kt.
const native = NativeModules.FullScreenPermission;

/** true / false, or null when this build can't tell (module missing). */
export async function canUseFullScreen() {
  if (!native) return null;
  try {
    return await native.canUse();
  } catch {
    return null;
  }
}

/** Opens this app's page in the phone's settings. */
export async function openFullScreenSettings() {
  try {
    if (native) {
      await native.openSettings();
      return;
    }
  } catch {
    // fall through to the generic app settings
  }
  Linking.openSettings();
}
