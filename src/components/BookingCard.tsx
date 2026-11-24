import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { formatBookingWhen, formatPrice, statusLabels } from '../lib/format';
import type { Booking, ServiceKind } from '../lib/types';
import { Card, colors, fonts, text } from './ui';

export type OwnerBooking = Booking & {
  profiles?: { full_name: string; phone: string | null; address: string | null; postcode: string | null };
};

export const serviceStyle: Record<ServiceKind, { icon: 'walk' | 'people' | 'home'; tint: string }> = {
  solo_walk: { icon: 'walk', tint: colors.primary },
  group_walk: { icon: 'people', tint: colors.accent },
  sit_in: { icon: 'home', tint: colors.blue },
};

export function ServiceBadge({ kind }: { kind?: ServiceKind }) {
  const s = serviceStyle[kind ?? 'solo_walk'];
  return (
    <View style={[styles.badge, { backgroundColor: s.tint }]}>
      <Ionicons name={s.icon} size={18} color="#fff" />
    </View>
  );
}

export function BookingCard({
  booking, block, children,
}: {
  booking: OwnerBooking; block?: { count: number; total: number }; children?: React.ReactNode;
}) {
  const dogs = booking.booking_dogs?.map((bd) => bd.dogs.name).join(', ');
  return (
    <Card>
      <View style={styles.top}>
        <ServiceBadge kind={booking.services?.kind} />
        <View style={{ flex: 1 }}>
          <Text style={text.title}>{booking.services?.name}</Text>
          <Text style={[styles.status, booking.status === 'approved' && { color: colors.primary }, !!booking.cancel_requested_at && { color: colors.accent }]}>
            {block ? `Block booking · ${block.count} dates` : booking.cancel_requested_at ? 'Asked to cancel' : statusLabels[booking.status]}
          </Text>
        </View>
      </View>
      {!block && <Text style={text.body}>{formatBookingWhen(booking)}</Text>}
      <Text style={text.body}>{booking.profiles?.full_name} · {dogs}</Text>
      {booking.profiles?.address ? <Text style={text.muted}>{booking.profiles.address} {booking.profiles.postcode}</Text> : null}
      <Text style={text.muted}>
        {block ? `${formatPrice(block.total)} in total` : formatPrice(booking.price_pence)} · {booking.payment_method === 'card' ? 'Card' : 'Invoice'}
      </Text>
      {booking.customer_notes ? <Text style={[text.muted, { marginTop: 4 }]}>“{booking.customer_notes}”</Text> : null}
      {children}
    </Card>
  );
}

export const ownerBookingSelect =
  '*, services(name, kind), booking_dogs(dogs(name)), profiles(full_name, phone, address, postcode)';

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  status: { fontSize: 13, fontFamily: fonts.bold, color: colors.muted },
});
