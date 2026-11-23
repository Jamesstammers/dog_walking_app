import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { BookingCard, ownerBookingSelect, type OwnerBooking } from '../../components/BookingCard';
import { Button, colors, text } from '../../components/ui';
import { notify } from '../../lib/dialog';
import { supabase } from '../../lib/supabase';

export default function Requests() {
  const [requests, setRequests] = useState<OwnerBooking[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  async function decide(booking: OwnerBooking, status: 'approved' | 'declined') {
    setBusyId(booking.id);
    // TODO(stripe): on approval, charge the saved card or create the invoice server-side.
    const { error } = await supabase
      .from('bookings')
      .update({ status, decided_at: new Date().toISOString() })
      .eq('id', booking.id)
      .eq('status', 'requested');
    setBusyId(null);
    if (error) notify('Could not update', error.message);
    load();
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16 }}
      data={requests}
      keyExtractor={(b) => b.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
      ListEmptyComponent={<Text style={[text.muted, { textAlign: 'center', marginTop: 40 }]}>No requests waiting.</Text>}
      renderItem={({ item }) => (
        <BookingCard booking={item}>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <View style={{ flex: 1 }}>
              <Button title="Approve" onPress={() => decide(item, 'approved')} loading={busyId === item.id} />
            </View>
            <View style={{ flex: 1 }}>
              <Button variant="danger" title="Decline" onPress={() => decide(item, 'declined')} disabled={busyId === item.id} />
            </View>
          </View>
        </BookingCard>
      )}
    />
  );
}
