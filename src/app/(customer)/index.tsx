import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { ServiceBadge } from '../../components/BookingCard';
import { Button, Card, colors, fonts, text } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useBusinessInfo } from '../../lib/business';
import { formatBookingWhen, formatPrice, londonDateKey, statusLabels, walkStartsAt } from '../../lib/format';
import { notify, confirmAction } from '../../lib/dialog';
import { supabase } from '../../lib/supabase';
import type { Booking } from '../../lib/types';

export default function MyBookings() {
  const { session, profile } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { info } = useBusinessInfo();
  const noticeHours = info?.cancel_notice_hours ?? 24;
  // Close to the walk, cancelling an approved booking needs her OK.
  const needsOk = (b: Booking) =>
    b.status === 'approved' && walkStartsAt(b.booking_date, b.time_window).getTime() <= Date.now() + noticeHours * 3_600_000;

  const load = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    const { data } = await supabase
      .from('bookings')
      .select('*, services(name, kind), booking_dogs(dogs(name))')
      .eq('customer_id', session.user.id)
      .order('booking_date')
      .limit(200);
    // Upcoming bookings first (soonest at the top), then past ones (most recent first).
    const all = (data as Booking[]) ?? [];
    const today = londonDateKey(new Date());
    setBookings([...all.filter((b) => b.booking_date >= today), ...all.filter((b) => b.booking_date < today).reverse()]);
    setRefreshing(false);
  }, [session]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function cancel(booking: Booking) {
    const ask = needsOk(booking);
    confirmAction(
      ask ? 'Ask to cancel?' : 'Cancel this booking?',
      ask
        ? `${formatBookingWhen(booking)} is less than ${noticeHours} hours away, so we'll check with your walker first.`
        : formatBookingWhen(booking),
      ask ? 'Ask to cancel' : 'Cancel booking',
      async () => {
        const { data, error } = await supabase.rpc('cancel_booking', { p_booking_id: booking.id });
        if (error) notify('Could not cancel', error.message);
        else if (data === 'requested') notify('Cancellation requested', "We've let your walker know. You'll see here once she's replied.");
        else notify('Booking cancelled');
        load();
      },
    );
  }

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
        const upcoming = walkStartsAt(item.booking_date, item.time_window).getTime() > Date.now();
        const canCancel = upcoming && !item.cancel_requested_at && (item.status === 'requested' || item.status === 'approved');
        return (
          <Card>
            <View style={styles.row}>
              <ServiceBadge kind={item.services?.kind} />
              <View style={{ flex: 1 }}>
                <Text style={text.title}>{item.services?.name}</Text>
                <Text style={[styles.status, item.status === 'approved' && { color: colors.primary }, !!item.cancel_requested_at && { color: colors.accent }]}>
                  {item.cancel_requested_at ? 'Cancellation requested' : statusLabels[item.status]}{item.batch_id ? ' · Block booking' : ''}
                </Text>
              </View>
            </View>
            <Text style={text.body}>{formatBookingWhen(item)}</Text>
            <Text style={text.muted}>
              {item.booking_dogs?.map((bd) => bd.dogs.name).join(', ')} · {formatPrice(item.price_pence)} ·{' '}
              {item.payment_method === 'card' ? 'Card' : 'Invoice'}
            </Text>
            {canCancel && <Button variant="danger" title={needsOk(item) ? 'Ask to cancel' : 'Cancel'} onPress={() => cancel(item)} />}
          </Card>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  status: { fontSize: 13, fontFamily: fonts.bold, color: colors.muted },
});
