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
    // Fetch a window around the London day, then filter by London date.
    const from = new Date(`${day}T00:00:00Z`).getTime() - 2 * 3600_000;
    const to = from + 28 * 3600_000;
    const { data } = await supabase
      .from('bookings')
      .select(ownerBookingSelect)
      .in('status', ['approved', 'requested', 'completed'])
      .gte('starts_at', new Date(from).toISOString())
      .lt('starts_at', new Date(to).toISOString())
      .order('starts_at');
    setBookings(((data as OwnerBooking[]) ?? []).filter((b) => londonDateKey(new Date(b.starts_at)) === day));
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
