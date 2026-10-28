import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import notifee from '@notifee/react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { ensureSirenChannel } from './src/notifications/channel';
import { subscribeToForegroundMessages } from './src/notifications/fcm';
import { subscribeToNotificationTaps, TEST_ORDER_ID } from './src/notifications/handlers';
import LoginScreen from './src/screens/LoginScreen';
import MyDeliveriesScreen from './src/screens/MyDeliveriesScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import OrderDetailScreen from './src/screens/OrderDetailScreen';
import SetupScreen from './src/screens/SetupScreen';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator();
const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', backgroundColor: colors.surface },
});
const navigationRef = createNavigationContainerRef();

function openOrder(orderId) {
  if (navigationRef.isReady() && orderId && orderId !== TEST_ORDER_ID) {
    navigationRef.navigate('OrderDetail', { id: Number(orderId) });
  }
}

/** Signed-in only: pushes while the app is open, taps on the siren notification, the first-run checklist. */
function SignedInEffects() {
  const { consumeFirstRun } = useAuth();
  const handledInitial = useRef(false);

  useEffect(() => {
    const stopPush = subscribeToForegroundMessages();
    const stopTaps = subscribeToNotificationTaps(openOrder);
    return () => {
      stopPush();
      stopTaps();
    };
  }, []);

  useEffect(() => {
    // The app was opened by tapping the siren (or its full-screen alert): go straight to that order.
    const timer = setTimeout(async () => {
      if (handledInitial.current) return;
      handledInitial.current = true;
      const initial = await notifee.getInitialNotification();
      const orderId = initial?.notification?.data?.orderId;
      if (orderId) {
        openOrder(orderId);
      } else if (consumeFirstRun() && navigationRef.isReady()) {
        navigationRef.navigate('Setup'); // right after the first sign-in
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [consumeFirstRun]);

  return null;
}

function Root() {
  const { status, user } = useAuth();
  const isRider = user?.mode === 'rider';

  useEffect(() => {
    if (!isRider) ensureSirenChannel().catch(() => {}); // riders get no order siren
  }, [isRider]);

  if (status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {status === 'signedIn' && !isRider && <SignedInEffects />}
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {status === 'signedIn' && isRider ? (
          <Stack.Screen name="MyDeliveries" component={MyDeliveriesScreen} />
        ) : status === 'signedIn' ? (
          <>
            <Stack.Screen name="Orders" component={OrdersScreen} />
            <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
            <Stack.Screen name="Setup" component={SetupScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
