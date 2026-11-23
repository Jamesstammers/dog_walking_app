import { Text, View } from 'react-native';
import { formatDateTime, formatPrice, statusLabels } from '../lib/format';
import type { Booking } from '../lib/types';
import { Card, colors, text } from './ui';

export type OwnerBooking = Booking & {
  profiles?: { full_name: string; phone: string | null; address: string | null; postcode: string | null };
};

export function BookingCard({ booking, children }: { booking: OwnerBooking; children?: React.ReactNode }) {
  const dogs = booking.booking_dogs?.map((bd) => bd.dogs.name).join(', ');
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={text.title}>{booking.services?.name}</Text>
        <Text style={{ fontSize: 13, fontWeight: '600', color: booking.status === 'approved' ? colors.primary : colors.muted }}>
          {statusLabels[booking.status]}
        </Text>
      </View>
      <Text style={text.body}>{formatDateTime(booking.starts_at)}</Text>
      <Text style={text.body}>{booking.profiles?.full_name} · {dogs}</Text>
      {booking.profiles?.address ? <Text style={text.muted}>{booking.profiles.address} {booking.profiles.postcode}</Text> : null}
      <Text style={text.muted}>
        {formatPrice(booking.price_pence)} · {booking.payment_method === 'card' ? 'Card' : 'Invoice'}
      </Text>
      {booking.customer_notes ? <Text style={[text.muted, { marginTop: 4 }]}>“{booking.customer_notes}”</Text> : null}
      {children}
    </Card>
  );
}

export const ownerBookingSelect =
  '*, services(name, kind), booking_dogs(dogs(name)), profiles(full_name, phone, address, postcode)';
