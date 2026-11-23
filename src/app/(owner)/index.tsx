import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { BookingCard, ownerBookingSelect, type OwnerBooking } from '../../components/BookingCard';
import { Button, colors, fonts, text } from '../../components/ui';
import { notify } from '../../lib/dialog';
import { formatDay, formatTime } from '../../lib/format';
import { supabase } from '../../lib/supabase';

type Group = { key: string; bookings: OwnerBooking[] };

export default function Requests() {
  const [requests, setRequests] = useState<OwnerBooking[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    const { data } = await supabase
      .from('bookings')
      .select(ownerBookingSelect)
      .eq('status', 'requested')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at');
    setRequests((data as OwnerBooking[]) ?? []);
    setRefreshing(false);
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

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16 }}
      data={groups}
      keyExtractor={(g) => g.key}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
      ListEmptyComponent={<Text style={[text.muted, { textAlign: 'center', marginTop: 40 }]}>No requests waiting.</Text>}
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
                    <Text style={styles.dateText}>{formatDay(new Date(b.starts_at))} {formatTime(b.starts_at)}</Text>
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
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  datePill: { backgroundColor: colors.primaryLight, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  dateText: { fontFamily: fonts.medium, fontSize: 13, color: colors.primary },
});
