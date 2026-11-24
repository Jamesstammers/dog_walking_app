import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { BookingCard, ownerBookingSelect, type OwnerBooking } from '../../components/BookingCard';
import { Chip, colors, SectionTitle, text } from '../../components/ui';
import { formatDay, londonDateKey, upcomingDays } from '../../lib/format';
import { supabase } from '../../lib/supabase';

export default function Schedule() {
  const days = useMemo(() => upcomingDays(28), []);
  const [day, setDay] = useState(() => londonDateKey(new Date()));
  const [bookings, setBookings] = useState<OwnerBooking[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('bookings')
      .select(ownerBookingSelect)
      .in('status', ['approved', 'requested', 'completed'])
      .eq('booking_date', day);
    const order = ['morning', 'afternoon', 'evening', 'any'];
    setBookings(((data as OwnerBooking[]) ?? []).sort((x, y) => order.indexOf(x.time_window) - order.indexOf(y.time_window)));
  }, [day]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {days.map((d) => {
          const key = londonDateKey(d);
          return <Chip key={key} label={formatDay(d)} selected={day === key} onPress={() => setDay(key)} />;
        })}
      </ScrollView>
      <SectionTitle>{bookings.length} booking{bookings.length === 1 ? '' : 's'}</SectionTitle>
      {bookings.length === 0 && <Text style={text.muted}>Nothing booked on this day.</Text>}
      {bookings.map((b) => <BookingCard key={b.id} booking={b} />)}
    </ScrollView>
  );
}
