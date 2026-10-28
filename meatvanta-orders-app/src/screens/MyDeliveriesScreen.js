import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { riderCash, riderDelivered, riderFailed, riderOrders, riderPickup } from '../api/endpoints';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { istTime, rupees } from '../format';
import { colors } from '../theme';

const REFRESH_EVERY_MS = 30 * 1000;

/** "Due 4:30 pm" / "Late by 12 min" */
function dueText(order) {
  if (order.status === 'delivered') return `Delivered ${istTime(order.deliveredAt)}`;
  const mins = Math.round((new Date(order.dueBy).getTime() - Date.now()) / 60000);
  if (mins < 0) return `Late by ${-mins} min`;
  return `Due by ${istTime(order.dueBy)}`;
}

function DeliveryCard({ order, busy, onPickup, onDelivered, onFailed }) {
  const done = order.status === 'delivered';
  return (
    <View style={[styles.card, order.isOverdue && styles.cardLate]}>
      <View style={styles.rowBetween}>
        <Text style={styles.number}>{order.orderNumber}</Text>
        <Text style={[styles.due, order.isOverdue && styles.dueLate]}>{dueText(order)}</Text>
      </View>

      <Text style={styles.customer}>{order.customerName}</Text>
      <Text style={styles.address}>{order.deliveryAddress}</Text>

      <View style={styles.linkRow}>
        <Pressable style={styles.linkButton} onPress={() => Linking.openURL(`tel:${order.customerPhone}`)}>
          <Text style={styles.linkText}>Call</Text>
        </Pressable>
        {!!order.mapUrl && (
          <Pressable style={styles.linkButton} onPress={() => Linking.openURL(order.mapUrl)}>
            <Text style={styles.linkText}>Map</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.items}>
        {order.items.map((item, index) => (
          <Text key={index} style={[styles.item, item.notSent > 0 && item.quantity === 0 && styles.itemGone]}>
            {item.quantity > 0 ? `${item.quantity} × ` : ''}
            {item.productName} {item.variantLabel}
            {item.selectedOptions.length > 0 ? ` · ${item.selectedOptions.map((o) => o.optionName || o.name || o).join(', ')}` : ''}
            {item.notSent > 0 ? (item.quantity === 0 ? '  — NOT AVAILABLE, do not take' : `  — ${item.notSent} not sent`) : ''}
          </Text>
        ))}
      </View>
      {!!order.notes && <Text style={styles.notes}>Note: {order.notes}</Text>}

      {order.amountToCollect > 0 ? (
        <View style={styles.collect}>
          <Text style={styles.collectLabel}>Collect cash</Text>
          <Text style={styles.collectAmount}>{rupees(order.amountToCollect)}</Text>
        </View>
      ) : (
        <Text style={styles.paid}>{done ? 'Paid' : 'Already paid — collect nothing'}</Text>
      )}

      {!!order.deliveryFailedReason && !done && <Text style={styles.failed}>Last problem: {order.deliveryFailedReason}</Text>}

      {order.waitingForShop && <Text style={styles.wait}>Shop is still getting this ready.</Text>}

      {order.canPickUp && (
        <Pressable style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={() => onPickup(order)}>
          <Text style={styles.primaryText}>Picked up</Text>
        </Pressable>
      )}
      {order.canDeliver && (
        <>
          <Pressable style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={() => onDelivered(order)}>
            <Text style={styles.primaryText}>Delivered</Text>
          </Pressable>
          <Pressable style={[styles.secondary, busy && styles.disabled]} disabled={busy} onPress={() => onFailed(order)}>
            <Text style={styles.secondaryText}>Could not deliver</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

/** What a delivery rider sees: only the orders given to them, and the three steps they can do. */
export default function MyDeliveriesScreen() {
  const { signOut, user } = useAuth();
  const [data, setData] = useState({ active: [], delivered: [] });
  const [cash, setCash] = useState({ amount: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [problemFor, setProblemFor] = useState(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [orders, held] = await Promise.all([riderOrders(), riderCash()]);
      setData(orders);
      setCash(held);
      setError('');
    } catch (e) {
      setError(errorMessage(e, 'Could not load your deliveries.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_EVERY_MS);
    const appState = AppState.addEventListener('change', (s) => s === 'active' && load());
    return () => {
      clearInterval(timer);
      appState.remove();
    };
  }, [load]);

  async function run(action) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (e) {
      Alert.alert('Could not update', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function onPickup(order) {
    Alert.alert('Picked up?', order.orderNumber, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes', onPress: () => run(() => riderPickup(order.id)) },
    ]);
  }

  function onDelivered(order) {
    const cashText = order.amountToCollect > 0 ? `Collected ${rupees(order.amountToCollect)} cash?` : 'Handed over?';
    Alert.alert(`${order.orderNumber} delivered?`, cashText, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes, delivered', onPress: () => run(() => riderDelivered(order.id)) },
    ]);
  }

  function onFailed(order) {
    setReason('');
    setProblemFor(order);
  }

  async function sendProblem() {
    const text = reason.trim();
    if (text.length < 3) {
      Alert.alert('Write a short reason', 'For example: customer not answering.');
      return;
    }
    const order = problemFor;
    setProblemFor(null);
    await run(() => riderFailed(order.id, text));
  }

  const list = [...data.active, ...data.delivered];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.title}>My deliveries</Text>
          {!!user?.name && <Text style={styles.who}>{user.name}</Text>}
        </View>
        <Pressable onPress={signOut} hitSlop={10}>
          <Text style={styles.topLink}>Sign out</Text>
        </Pressable>
      </View>

      {cash.amount > 0 && (
        <View style={styles.cashBanner}>
          <Text style={styles.cashText}>
            Cash with you: {rupees(cash.amount)} ({cash.count} {cash.count === 1 ? 'order' : 'orders'})
          </Text>
          <Text style={styles.cashHint}>Hand it to the shop.</Text>
        </View>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color={colors.brand} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(o) => String(o.id)}
          renderItem={({ item }) => (
            <DeliveryCard order={item} busy={busy} onPickup={onPickup} onDelivered={onDelivered} onFailed={onFailed} />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              colors={[colors.brand]}
            />
          }
          ListEmptyComponent={<Text style={styles.empty}>No deliveries for you right now.</Text>}
        />
      )}

      <Modal visible={!!problemFor} transparent animationType="fade" onRequestClose={() => setProblemFor(null)}>
        <View style={styles.modalBack}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>What went wrong?</Text>
            <Text style={styles.modalSub}>{problemFor?.orderNumber} · the shop will see this.</Text>
            <TextInput
              style={styles.modalInput}
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Customer not answering"
              placeholderTextColor="#8b7a78"
              maxLength={255}
              multiline
              autoFocus
            />
            <View style={styles.modalButtons}>
              <Pressable style={styles.secondary} onPress={() => setProblemFor(null)}>
                <Text style={styles.secondaryText}>Back</Text>
              </Pressable>
              <Pressable style={styles.primary} onPress={sendProblem}>
                <Text style={styles.primaryText}>Send</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 },
  title: { fontSize: 28, fontWeight: '800', color: colors.brand },
  who: { fontSize: 15, color: colors.inkSoft },
  topLink: { fontSize: 17, fontWeight: '600', color: colors.brandDark },
  cashBanner: { margin: 16, marginBottom: 0, backgroundColor: colors.accent, borderRadius: 14, padding: 14 },
  cashText: { fontSize: 19, fontWeight: '800', color: colors.ink },
  cashHint: { fontSize: 14, color: colors.ink, marginTop: 2 },
  list: { padding: 16, paddingBottom: 40, gap: 14, flexGrow: 1 },
  loader: { marginTop: 40 },
  empty: { textAlign: 'center', marginTop: 60, fontSize: 18, color: colors.inkSoft },
  error: { marginHorizontal: 16, marginTop: 8, color: colors.brand, fontSize: 15 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.line, gap: 10 },
  cardLate: { borderColor: colors.brand, borderWidth: 2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  number: { fontSize: 24, fontWeight: '800', color: colors.ink },
  due: { fontSize: 16, fontWeight: '700', color: colors.inkSoft },
  dueLate: { color: colors.brand },
  customer: { fontSize: 20, fontWeight: '700', color: colors.ink },
  address: { fontSize: 17, color: colors.ink, lineHeight: 24 },
  linkRow: { flexDirection: 'row', gap: 12 },
  linkButton: { flex: 1, borderWidth: 2, borderColor: colors.brand, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  linkText: { color: colors.brand, fontSize: 18, fontWeight: '800' },
  items: { gap: 4, paddingVertical: 4 },
  item: { fontSize: 17, color: colors.ink },
  itemGone: { color: colors.brand, fontWeight: '700' },
  notes: { fontSize: 15, color: colors.inkSoft, fontStyle: 'italic' },
  collect: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff3d6', borderRadius: 12, padding: 12 },
  collectLabel: { fontSize: 18, fontWeight: '700', color: colors.ink },
  collectAmount: { fontSize: 28, fontWeight: '800', color: colors.brand },
  paid: { fontSize: 16, fontWeight: '700', color: colors.ok },
  failed: { fontSize: 15, color: colors.warn, fontWeight: '600' },
  wait: { fontSize: 16, color: colors.warn, fontWeight: '600' },
  primary: { flex: 1, backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  primaryText: { color: colors.white, fontSize: 20, fontWeight: '800' },
  secondary: { flex: 1, borderWidth: 2, borderColor: colors.line, borderRadius: 14, paddingVertical: 16, alignItems: 'center', backgroundColor: colors.white },
  secondaryText: { color: colors.inkSoft, fontSize: 18, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: colors.white, borderRadius: 18, padding: 20, gap: 12 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: colors.ink },
  modalSub: { fontSize: 15, color: colors.inkSoft },
  modalInput: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, fontSize: 18, minHeight: 80, textAlignVertical: 'top', color: colors.ink },
  modalButtons: { flexDirection: 'row', gap: 12 },
});
