import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import notifee, { AuthorizationStatus } from '@notifee/react-native';
import { showOrderAlarm } from '../notifications/alarm';
import { TEST_ORDER_ID } from '../notifications/handlers';
import { isPushAvailable } from '../notifications/fcm';
import { colors } from '../theme';

/**
 * Checklist that makes the siren reliable. Phones (especially Xiaomi, Realme, Oppo, Vivo, Samsung) kill
 * background apps unless battery saving is switched off for this app. Each row shows its state and a
 * button; everything is re-checked every time the app comes back to the screen.
 */
function Row({ title, state, detail, buttonText, onPress }) {
  const color = state === 'ok' ? colors.ok : state === 'bad' ? colors.brand : colors.warn;
  const mark = state === 'ok' ? '✔' : state === 'bad' ? '✖' : '!';
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={[styles.mark, { color }]}>{mark}</Text>
        <Text style={styles.rowTitle}>{title}</Text>
      </View>
      {!!detail && <Text style={styles.detail}>{detail}</Text>}
      {!!buttonText && (
        <Pressable style={styles.rowButton} onPress={onPress}>
          <Text style={styles.rowButtonText}>{buttonText}</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function SetupScreen({ navigation }) {
  const [notifOk, setNotifOk] = useState(null);
  const [batteryRestricted, setBatteryRestricted] = useState(null);
  const [power, setPower] = useState(null);

  const check = useCallback(async () => {
    try {
      const settings = await notifee.getNotificationSettings();
      setNotifOk(settings.authorizationStatus === AuthorizationStatus.AUTHORIZED);
    } catch {
      setNotifOk(null);
    }
    try {
      setBatteryRestricted(await notifee.isBatteryOptimizationEnabled());
    } catch {
      setBatteryRestricted(null);
    }
    try {
      setPower(await notifee.getPowerManagerInfo());
    } catch {
      setPower(null);
    }
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, [check]);

  async function openFullScreenSettings() {
    try {
      await Linking.sendIntent('android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT');
    } catch {
      Linking.openSettings();
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={10}>
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Setup</Text>
        <Text style={styles.intro}>Do these once so the siren always rings, even when the phone is locked or the app is closed.</Text>

        <Row
          title="Notifications"
          state={notifOk === null ? 'warn' : notifOk ? 'ok' : 'bad'}
          detail={notifOk ? 'Allowed.' : 'Allow notifications, or no order will ring.'}
          buttonText={notifOk ? null : 'Allow notifications'}
          onPress={async () => {
            await notifee.requestPermission();
            check();
          }}
        />

        <Row
          title="Full-screen alerts (Android 14+)"
          state="warn"
          detail="Lets the siren open over the lock screen. On Android 14 or newer, switch it ON for this app. The phone cannot tell us its state, so please check."
          buttonText="Open settings"
          onPress={openFullScreenSettings}
        />

        <Row
          title="Battery"
          state={batteryRestricted === null ? 'warn' : batteryRestricted ? 'bad' : 'ok'}
          detail={batteryRestricted ? 'Battery saving can stop the siren. Set this app to "Unrestricted / Don\'t optimise".' : 'Not restricted.'}
          buttonText={batteryRestricted ? 'Fix battery setting' : null}
          onPress={() => notifee.openBatteryOptimizationSettings()}
        />

        {power && power.activity && (
          <Row
            title={`Phone power manager (${power.manufacturer})`}
            state="warn"
            detail="This phone has an extra power manager. Allow this app to Auto-start and set its battery to 'No restrictions'."
            buttonText="Open power manager"
            onPress={() => notifee.openPowerManagerSettings()}
          />
        )}

        <Row
          title="Push messages"
          state={isPushAvailable() ? 'ok' : 'bad'}
          detail={isPushAvailable() ? 'Connected.' : 'Not connected: this build has no Firebase file (google-services.json), so new orders will not ring. Orders still load when you open the app.'}
        />

        <Pressable
          style={styles.test}
          onPress={() =>
            showOrderAlarm({
              orderId: TEST_ORDER_ID,
              orderNumber: 'TEST',
              total: '0',
              itemsSummary: 'This is a test. Tap Acknowledge to stop the siren.',
            })
          }
        >
          <Text style={styles.testText}>Test siren</Text>
        </Pressable>
        <Text style={styles.testHint}>Lock the phone first if you want to test the lock-screen alert.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  back: { paddingHorizontal: 18, paddingVertical: 12 },
  backText: { fontSize: 20, color: colors.brandDark, fontWeight: '700' },
  content: { padding: 18, paddingBottom: 40, gap: 14 },
  title: { fontSize: 32, fontWeight: '800', color: colors.brand },
  intro: { fontSize: 16, color: colors.inkSoft, lineHeight: 22 },
  row: { backgroundColor: colors.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.line, gap: 8 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { fontSize: 22, fontWeight: '900', width: 26 },
  rowTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, flex: 1 },
  detail: { fontSize: 15, color: colors.inkSoft, lineHeight: 21 },
  rowButton: { backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  rowButtonText: { color: colors.white, fontSize: 17, fontWeight: '700' },
  test: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 20, alignItems: 'center', marginTop: 6 },
  testText: { color: colors.ink, fontSize: 21, fontWeight: '800' },
  testHint: { textAlign: 'center', color: colors.inkSoft, fontSize: 14 },
});
