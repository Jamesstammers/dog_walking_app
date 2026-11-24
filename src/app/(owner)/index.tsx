import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { BookingCard, ownerBookingSelect, type OwnerBooking } from '../../components/BookingCard';
import { Button, colors, fonts, text } from '../../components/ui';
import { notify } from '../../lib/dialog';
import { formatBookingWhen, londonDateKey } from '../../lib/format';
import { refreshOwnerAlerts } from '../../lib/ownerAlerts';
import { supabase } from '../../lib/supabase';

type Group = { key: string; bookings: OwnerBooking[] };

export default function Requests() {
  const [requests, setRequests] = useState<OwnerBooking[]>([]);
  const [cancels, setCancels] = useState<OwnerBooking[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    const [{ data }, { data: c }] = await Promise.all([
      supabase
        .from('bookings')
        .select(ownerBookingSelect)
        .eq('status', 'requested')
        .gte('booking_date', londonDateKey(new Date()))
        .order('booking_date'),
      supabase
        .from('bookings')
        .select(ownerBookingSelect)
        .eq('status', 'approved')
        .not('cancel_requested_at', 'is', null)
        .order('booking_date'),
    ]);
    setRequests((data as OwnerBooking[]) ?? []);
    setCancels((c as OwnerBooking[]) ?? []);
    setRefreshing(false);
    refreshOwnerAlerts();
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // A block booking arrives as several requests with one batch id; show it as one card.
  const groups = useMemo(() => {
    const map = new Map<string, OwnerBooking[]>();
    for (const b of requests) {
      const key = b.batch_id ?? b.id;
      map.set(key, [...(map.get(key) ?? []), b]);
    }
    return [...map.entries()].map(([key, bookings]): Group => ({ key, bookings }));
  }, [requests]);

  async function decide(group: Group, status: 'approved' | 'declined') {
    setBusyKey(group.key);
    // TODO(stripe): on approval, charge the saved card or create the invoice server-side.
    const { error } = await supabase
      .from('bookings')
      .update({ status, decided_at: new Date().toISOString() })
      .in('id', group.bookings.map((b) => b.id))
      .eq('status', 'requested');
    setBusyKey(null);
    if (error) notify('Could not update', error.message);
    else {
      const n = group.bookings.length;
      notify(`${n > 1 ? `${n} bookings` : 'Booking'} ${status === 'approved' ? 'approved' : 'declined'}`);
    }
    load();
  }

  async function decideCancel(b: OwnerBooking, approve: boolean) {
    setBusyKey(`c-${b.id}`);
    // TODO(stripe): refund or void the payment when a paid booking is cancelled.
    const { error } = await supabase.rpc('decide_cancellation', { p_booking_id: b.id, p_approve: approve });
    setBusyKey(null);
    if (error) notify('Could not update', error.message);
    else notify(approve ? 'Booking cancelled' : 'Booking kept', approve ? 'The customer will see it as cancelled.' : 'The walk stays booked.');
    load();
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16 }}
      data={groups}
      keyExtractor={(g) => g.key}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
      ListHeaderComponent={
        cancels.length > 0 ? (
          <View style={{ marginBottom: 8 }}>
            <Text style={styles.heading}>Asked to cancel</Text>
            {cancels.map((b) => (
              <BookingCard key={b.id} booking={b}>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Button title="Let them cancel" onPress={() => decideCancel(b, true)} loading={busyKey === `c-${b.id}`} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button variant="secondary" title="Keep booking" onPress={() => decideCancel(b, false)} disabled={busyKey === `c-${b.id}`} />
                  </View>
                </View>
              </BookingCard>
            ))}
            {groups.length > 0 && <Text style={styles.heading}>New requests</Text>}
          </View>
        ) : undefined
      }
      ListEmptyComponent={
        cancels.length === 0 ? <Text style={[text.muted, { textAlign: 'center', marginTop: 40 }]}>No requests waiting.</Text> : undefined
      }
      renderItem={({ item: group }) => {
        const first = group.bookings[0];
        const n = group.bookings.length;
        const busy = busyKey === group.key;
        return (
          <BookingCard booking={first} block={n > 1 ? { count: n, total: group.bookings.reduce((s, b) => s + b.price_pence, 0) } : undefined}>
            {n > 1 && (
              <View style={styles.dates}>
                {group.bookings.map((b) => (
                  <View key={b.id} style={styles.datePill}>
                    <Text style={styles.dateText}>{formatBookingWhen(b)}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <View style={{ flex: 1 }}>
                <Button title={n > 1 ? `Approve all ${n}` : 'Approve'} onPress={() => decide(group, 'approved')} loading={busy} />
              </View>
              <View style={{ flex: 1 }}>
                <Button variant="danger" title={n > 1 ? 'Decline all' : 'Decline'} onPress={() => decide(group, 'declined')} disabled={busy} />
              </View>
            </View>
          </BookingCard>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  heading: { fontFamily: fonts.display, fontSize: 24, color: colors.text, marginBottom: 8 },
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  datePill: { backgroundColor: colors.primaryLight, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  dateText: { fontFamily: fonts.medium, fontSize: 13, color: colors.primary },
});
