import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, text } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDateTime, formatPrice, statusLabels } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import type { Booking } from '../../lib/types';

export default function MyBookings() {
  const { session, profile } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    const { data } = await supabase
      .from('bookings')
      .select('*, services(name, kind), booking_dogs(dogs(name))')
      .eq('customer_id', session.user.id)
      .order('starts_at', { ascending: false })
      .limit(100);
    setBookings((data as Booking[]) ?? []);
    setRefreshing(false);
  }, [session]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function cancel(booking: Booking) {
    Alert.alert('Cancel this booking?', formatDateTime(booking.starts_at), [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel booking',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('cancel_booking', { p_booking_id: booking.id });
          if (error) Alert.alert('Could not cancel', error.message);
          load();
        },
      },
    ]);
  }

  const now = Date.now();
  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16 }}
      data={bookings}
      keyExtractor={(b) => b.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
      ListHeaderComponent={
        profile && !profile.approved ? (
          <Card>
            <Text style={text.title}>Your account is almost ready</Text>
            <Text style={[text.muted, { marginTop: 4 }]}>
              We'll arrange a meet and greet with you and your dog. Once that's done you can book online. Add your dogs in the meantime.
            </Text>
          </Card>
        ) : undefined
      }
      ListEmptyComponent={<Text style={[text.muted, { textAlign: 'center', marginTop: 40 }]}>No bookings yet.</Text>}
      renderItem={({ item }) => {
        const upcoming = new Date(item.starts_at).getTime() > now;
        const canCancel = upcoming && (item.status === 'requested' || item.status === 'approved');
        return (
          <Card>
            <View style={styles.row}>
              <Text style={text.title}>{item.services?.name}</Text>
              <Text style={[styles.status, item.status === 'approved' && { color: colors.primary }]}>{statusLabels[item.status]}</Text>
            </View>
            <Text style={text.body}>{formatDateTime(item.starts_at)}</Text>
            <Text style={text.muted}>
              {item.booking_dogs?.map((bd) => bd.dogs.name).join(', ')} · {formatPrice(item.price_pence)} ·{' '}
              {item.payment_method === 'card' ? 'Card' : 'Invoice'}
            </Text>
            {canCancel && <Button variant="danger" title="Cancel" onPress={() => cancel(item)} />}
          </Card>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  status: { fontSize: 13, fontWeight: '600', color: colors.muted },
});
