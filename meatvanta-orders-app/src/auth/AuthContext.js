import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import notifee from '@notifee/react-native';
import { login as apiLogin, logout as apiLogout, me } from '../api/endpoints';
import { setUnauthorizedHandler } from '../api/client';
import { clearToken, getSavedMode, getToken, saveToken } from './storage';
import { currentFcmToken, subscribeToTokenRefresh, syncFcmToken } from '../notifications/fcm';

const AuthContext = createContext(null);

function deviceName() {
  const c = Platform.constants || {};
  return [c.Manufacturer, c.Model].filter(Boolean).join(' ') || 'Android phone';
}

/**
 * Sign-in state for the whole app: 'loading' (checking the saved token) -> 'signedIn' | 'signedOut'.
 * A 401 from the server at any time (logged out elsewhere, account switched off, permission removed)
 * signs the phone out here.
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null });
  const firstRun = useRef(false);

  const signOutLocal = useCallback(async () => {
    await clearToken();
    await notifee.cancelAllNotifications(); // no siren should keep ringing after sign-out
    setState({ status: 'signedOut', user: null });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(signOutLocal);
  }, [signOutLocal]);

  // On start: is there a saved token, and does the server still accept it?
  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) {
        setState({ status: 'signedOut', user: null });
        return;
      }
      try {
        const user = await me();
        if (user.mode !== (await getSavedMode())) await saveToken(token, user.mode); // role changed since last time
        setState({ status: 'signedIn', user });
      } catch (error) {
        // 401 is handled by the interceptor (signs out). Any other failure (no signal) keeps the
        // phone signed in - orders and the siren must still work.
        if (error.response?.status !== 401) setState({ status: 'signedIn', user: { mode: await getSavedMode() } });
      }
    })();
  }, []);

  // Signed in: keep the backend's copy of this phone's push token fresh.
  useEffect(() => {
    if (state.status !== 'signedIn') return undefined;
    syncFcmToken();
    return subscribeToTokenRefresh();
  }, [state.status]);

  const signIn = useCallback(async (email, password) => {
    const fcmToken = await currentFcmToken();
    const { token, user } = await apiLogin({ email: email.trim(), password, deviceName: deviceName(), fcmToken });
    await saveToken(token, user.mode);
    firstRun.current = true;
    setState({ status: 'signedIn', user });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiLogout(); // stops pushes to this phone
    } catch {
      // offline - sign out here anyway
    }
    await signOutLocal();
  }, [signOutLocal]);

  /** True once, right after a fresh sign-in (App.js uses it to open the Setup checklist). */
  const consumeFirstRun = useCallback(() => {
    const was = firstRun.current;
    firstRun.current = false;
    return was;
  }, []);

  const value = useMemo(() => ({ ...state, signIn, signOut, consumeFirstRun }), [state, signIn, signOut, consumeFirstRun]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
