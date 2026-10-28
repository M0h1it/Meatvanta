import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, DeviceEventEmitter, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getOrder, setStatus } from '../api/endpoints';
import { errorMessage } from '../api/client';
import { acknowledgeOrder, ORDERS_CHANGED } from '../notifications/handlers';
import { istTime, minutesAgo, NEXT_STATUS_BUTTON, rupees, STATUS_LABELS } from '../format';
import { colors } from '../theme';

/** What is in the order and what it costs - and the two things staff can do: "Seen it" and move it on. */
export default function OrderDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrder(await getOrder(id));
      setError('');
    } catch (e) {
      setError(errorMessage(e, 'Could not load this order.'));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function onAcknowledge() {
    setBusy(true);
    await acknowledgeOrder(id); // stops the siren here, tells the server, stops it on other phones
    await load();
    setBusy(false);
  }

  function onNextStatus() {
    const next = order.nextStatus;
    Alert.alert(`${NEXT_STATUS_BUTTON[next]}?`, `${order.orderNumber} · ${rupees(order.total)}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes',
        onPress: async () => {
          setBusy(true);
          try {
            setOrder(await setStatus(id, next));
            DeviceEventEmitter.emit(ORDERS_CHANGED);
          } catch (e) {
            Alert.alert('Could not change the status', errorMessage(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.screen}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator style={styles.loader} size="large" color={colors.brand} />}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right', 'bottom']}>
      <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={10}>
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.number}>{order.orderNumber}</Text>
          <Text style={styles.pill}>{STATUS_LABELS[order.status] || order.status}</Text>
        </View>
        <Text style={styles.when}>
          {istTime(order.createdAt)} · {minutesAgo(order.createdAt)}
        </Text>
        {!order.acknowledged && (
          <Text style={styles.unseen}>{order.overdue ? 'NOT SEEN for more than 15 minutes' : 'Not seen yet'}</Text>
        )}
        {order.acknowledged && !!order.acknowledgedBy && <Text style={styles.seen}>Seen by {order.acknowledgedBy}</Text>}

        <View style={styles.box}>
          {order.items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.itemText}>
                <Text style={styles.itemName}>
                  {item.quantity} × {item.productName}
                </Text>
                <Text style={styles.itemSub}>
                  {item.variantLabel}
                  {item.options.length > 0 ? ` · ${item.options.join(', ')}` : ''}
                </Text>
              </View>
              <Text style={styles.itemPrice}>{rupees(item.lineTotal)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Amount</Text>
            <Text style={styles.totalValue}>{rupees(order.total)}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.actions}>
        {!order.acknowledged && (
          <Pressable style={[styles.button, busy && styles.disabled]} onPress={onAcknowledge} disabled={busy}>
            <Text style={styles.buttonText}>Acknowledge (seen it)</Text>
          </Pressable>
        )}
        {!!order.nextStatus && (
          <Pressable style={[styles.buttonOutline, busy && styles.disabled]} onPress={onNextStatus} disabled={busy}>
            <Text style={styles.buttonOutlineText}>{NEXT_STATUS_BUTTON[order.nextStatus]}</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  loader: { marginTop: 40 },
  itemText: { flex: 1 },
  back: { paddingHorizontal: 18, paddingVertical: 12 },
  backText: { fontSize: 20, color: colors.brandDark, fontWeight: '700' },
  content: { padding: 18, paddingBottom: 30 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  number: { fontSize: 32, fontWeight: '800', color: colors.ink },
  pill: { fontSize: 15, fontWeight: '700', color: colors.inkSoft, backgroundColor: '#efe6da', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, overflow: 'hidden' },
  when: { fontSize: 16, color: colors.inkSoft, marginTop: 4 },
  unseen: { marginTop: 10, color: colors.white, backgroundColor: colors.brand, fontWeight: '800', fontSize: 16, padding: 10, borderRadius: 10, overflow: 'hidden', textAlign: 'center' },
  seen: { marginTop: 10, color: colors.ok, fontSize: 16, fontWeight: '600' },
  box: { marginTop: 18, backgroundColor: colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.line },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 12 },
  itemName: { fontSize: 20, fontWeight: '700', color: colors.ink },
  itemSub: { fontSize: 15, color: colors.inkSoft, marginTop: 2 },
  itemPrice: { fontSize: 18, fontWeight: '700', color: colors.ink },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16 },
  totalLabel: { fontSize: 20, fontWeight: '700', color: colors.inkSoft },
  totalValue: { fontSize: 34, fontWeight: '800', color: colors.brand },
  actions: { padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
  button: { backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 20, alignItems: 'center' },
  buttonText: { color: colors.white, fontSize: 21, fontWeight: '800' },
  buttonOutline: { borderWidth: 2, borderColor: colors.brand, borderRadius: 14, paddingVertical: 18, alignItems: 'center', backgroundColor: colors.white },
  buttonOutlineText: { color: colors.brand, fontSize: 20, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  error: { color: colors.brand, fontSize: 17, padding: 18 },
});
