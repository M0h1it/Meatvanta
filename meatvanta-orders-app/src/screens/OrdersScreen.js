import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  DeviceEventEmitter,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { listOrders } from '../api/endpoints';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ORDERS_CHANGED } from '../notifications/handlers';
import { istTime, minutesAgo, rupees, STATUS_LABELS } from '../format';
import { colors } from '../theme';

const TABS = [
  { key: 'new', label: 'New' },
  { key: 'active', label: 'Active' },
];
const REFRESH_EVERY_MS = 30 * 1000;

function OrderCard({ order, onPress }) {
  const unseen = !order.acknowledged;
  return (
    <Pressable onPress={onPress} style={[styles.card, unseen && styles.cardUnseen]}>
      <View style={styles.rowBetween}>
        <Text style={[styles.number, unseen && styles.light]}>{order.orderNumber}</Text>
        <Text style={[styles.amount, unseen && styles.light]}>{rupees(order.total)}</Text>
      </View>
      <Text style={[styles.items, unseen && styles.light]} numberOfLines={3}>
        {order.itemsSummary || '—'}
      </Text>
      <View style={styles.rowBetween}>
        <Text style={[styles.meta, unseen && styles.lightSoft]}>
          {istTime(order.createdAt)} · {minutesAgo(order.createdAt)}
        </Text>
        <Text style={[styles.pill, unseen && styles.pillUnseen]}>{STATUS_LABELS[order.status] || order.status}</Text>
      </View>
      {order.overdue && <Text style={styles.overdue}>NOT SEEN for more than 15 minutes</Text>}
    </Pressable>
  );
}

export default function OrdersScreen({ navigation }) {
  const { signOut } = useAuth();
  const [tab, setTab] = useState('new');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setOrders(await listOrders(tab));
      setError('');
    } catch (e) {
      setError(errorMessage(e, 'Could not load orders.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  // Opening the app (or coming back to this screen) always refreshes - nothing depends on push alone.
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  useEffect(() => {
    const timer = setInterval(load, REFRESH_EVERY_MS);
    const appState = AppState.addEventListener('change', (s) => s === 'active' && load());
    const pushed = DeviceEventEmitter.addListener(ORDERS_CHANGED, load);
    return () => {
      clearInterval(timer);
      appState.remove();
      pushed.remove();
    };
  }, [load]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Orders</Text>
        <View style={styles.topButtons}>
          <Pressable onPress={() => navigation.navigate('Setup')} hitSlop={10}>
            <Text style={styles.topLink}>Setup</Text>
          </Pressable>
          <Pressable onPress={signOut} hitSlop={10}>
            <Text style={styles.topLink}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabOn]}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      {loading && orders.length === 0 ? (
        <ActivityIndicator style={styles.loader} size="large" color={colors.brand} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => String(o.id)}
          renderItem={({ item }) => <OrderCard order={item} onPress={() => navigation.navigate('OrderDetail', { id: item.id })} />}
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
          ListEmptyComponent={
            <Text style={styles.empty}>{tab === 'new' ? 'No new orders waiting.' : 'No orders in progress.'}</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 },
  title: { fontSize: 30, fontWeight: '800', color: colors.brand },
  topButtons: { flexDirection: 'row', gap: 22 },
  topLink: { fontSize: 17, fontWeight: '600', color: colors.brandDark },
  tabs: { flexDirection: 'row', margin: 16, backgroundColor: '#efe6da', borderRadius: 14, padding: 4 },
  tab: { flex: 1, paddingVertical: 14, borderRadius: 11, alignItems: 'center' },
  tabOn: { backgroundColor: colors.brand },
  tabText: { fontSize: 18, fontWeight: '700', color: colors.inkSoft },
  tabTextOn: { color: colors.white },
  list: { paddingHorizontal: 16, paddingBottom: 30, gap: 12, flexGrow: 1 },
  loader: { marginTop: 40 },
  empty: { textAlign: 'center', marginTop: 60, fontSize: 18, color: colors.inkSoft },
  error: { marginHorizontal: 16, color: colors.brand, fontSize: 15 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.line, gap: 8 },
  cardUnseen: { backgroundColor: colors.brand, borderColor: colors.brandDark },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  number: { fontSize: 22, fontWeight: '800', color: colors.ink },
  amount: { fontSize: 24, fontWeight: '800', color: colors.ink },
  items: { fontSize: 17, color: colors.ink, lineHeight: 23 },
  meta: { fontSize: 14, color: colors.inkSoft },
  light: { color: colors.white },
  lightSoft: { color: 'rgba(255,255,255,0.8)' },
  pill: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkSoft,
    backgroundColor: '#efe6da',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  pillUnseen: { color: colors.brandDark, backgroundColor: colors.white },
  overdue: { color: colors.white, backgroundColor: colors.brandDark, fontWeight: '800', padding: 8, borderRadius: 8, textAlign: 'center', overflow: 'hidden' },
});
