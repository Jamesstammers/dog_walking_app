import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { addDays, Calendar, weekdayOf } from '../../components/Calendar';
import { Button, Card, Chip, colors, Field, fonts, SectionTitle, text } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { notify } from '../../lib/dialog';
import { formatDay, formatPrice, formatTime, londonDateKey } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import type { Dog, PaymentMethod, Service, ServiceKind } from '../../lib/types';

const kinds: Record<ServiceKind, { title: string; blurb: string; icon: 'walk' | 'people' | 'home'; tint: string }> = {
  solo_walk: { title: 'Solo walk', blurb: 'One-to-one walk for your dog', icon: 'walk', tint: colors.primary },
  group_walk: { title: 'Group walk', blurb: 'Walk with a small group of friendly dogs', icon: 'people', tint: colors.accent },
  sit_in: { title: 'Sit-in', blurb: 'A home visit to feed and keep your dog company', icon: 'home', tint: colors.blue },
};

const BOOK_AHEAD_DAYS = 90;
const REPEATS = [
  { weeks: 1, label: 'Just these dates' },
  { weeks: 4, label: 'Weekly for 4 weeks' },
  { weeks: 8, label: 'Weekly for 8 weeks' },
  { weeks: 12, label: 'Weekly for 12 weeks' },
];

const newBatchId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export default function Book() {
  const { session, profile } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [kind, setKind] = useState<ServiceKind | null>(null);
  const [duration, setDuration] = useState<30 | 60>(60);
  const [dogIds, setDogIds] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  // Per date: London "HH:MM" -> ISO start time, for every free slot.
  const [slotsByDate, setSlotsByDate] = useState<Record<string, Record<string, string>>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [time, setTime] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>('card');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const today = londonDateKey(new Date());
  const maxDate = addDays(today, BOOK_AHEAD_DAYS);

  useFocusEffect(
    useCallback(() => {
      supabase.from('services').select('*').eq('active', true).then(({ data }) => setServices((data as Service[]) ?? []));
      supabase.from('working_hours').select('weekday').then(({ data }) => {
        if (data) setWorkingDays((data as { weekday: number }[]).map((w) => w.weekday));
      });
      if (session) {
        supabase.from('dogs').select('*').eq('owner_id', session.user.id).order('name')
          .then(({ data }) => setDogs((data as Dog[]) ?? []));
      }
    }, [session]),
  );

  const service = useMemo(
    () => services.find((s) => s.kind === kind && s.duration_min === duration) ?? null,
    [services, kind, duration],
  );
  const dogCount = Math.max(dogIds.length, 1);
  const isDisabled = useCallback((key: string) => !workingDays.includes(weekdayOf(key)), [workingDays]);

  // Every date in the booking: the picked dates plus their weekly repeats.
  const dates = useMemo(() => {
    const all = new Set<string>();
    for (const d of picked) {
      for (let w = 0; w < repeatWeeks; w++) {
        const key = addDays(d, 7 * w);
        if (key <= maxDate && !isDisabled(key)) all.add(key);
      }
    }
    return [...all].sort();
  }, [picked, repeatWeeks, maxDate, isDisabled]);
  const repeated = dates.filter((d) => !picked.includes(d));

  useEffect(() => {
    setTime(null);
    if (!service || dates.length === 0) {
      setSlotsByDate({});
      return;
    }
    let stale = false;
    setLoadingSlots(true);
    Promise.all(
      dates.map(async (d) => {
        const { data } = await supabase.rpc('available_slots', { p_service_id: service.id, p_date: d, p_dog_count: dogCount });
        const map: Record<string, string> = {};
        for (const r of (data as { starts_at: string }[]) ?? []) map[formatTime(r.starts_at)] = r.starts_at;
        return [d, map] as const;
      }),
    ).then((entries) => {
      if (stale) return;
      setSlotsByDate(Object.fromEntries(entries));
      setLoadingSlots(false);
    });
    return () => { stale = true; };
  }, [service, dates, dogCount]);

  // Times free on every chosen date come first; times free on only some are offered too.
  const { allDays, someDays } = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of dates) for (const t of Object.keys(slotsByDate[d] ?? {})) counts[t] = (counts[t] ?? 0) + 1;
    const sorted = Object.keys(counts).sort();
    return {
      allDays: sorted.filter((t) => counts[t] === dates.length),
      someDays: sorted.filter((t) => counts[t] < dates.length).map((t) => ({ t, n: counts[t] })),
    };
  }, [slotsByDate, dates]);

  const bookable = time ? dates.filter((d) => slotsByDate[d]?.[time]) : [];
  const total = service ? service.price_pence * bookable.length : 0;

  function togglePick(key: string) {
    setPicked((p) => (p.includes(key) ? p.filter((d) => d !== key) : [...p, key]));
  }

  function toggleDog(id: string) {
    setDogIds((ids) => (ids.includes(id) ? ids.filter((d) => d !== id) : [...ids, id]));
  }

  async function submit() {
    if (!service || !time || bookable.length === 0 || dogIds.length === 0) return;
    setSubmitting(true);
    const batchId = bookable.length > 1 ? newBatchId() : null;
    const results = await Promise.all(
      bookable.map((d) =>
        supabase.rpc('request_booking', {
          p_service_id: service.id,
          p_starts_at: slotsByDate[d][time],
          p_dog_ids: dogIds,
          p_payment_method: payment,
          p_notes: notes || null,
          p_batch_id: batchId,
        }),
      ),
    );
    setSubmitting(false);
    const ok = results.filter((r) => !r.error).length;
    // TODO(stripe): for card payments, collect and save the card here before confirming.
    if (ok === 0) {
      notify('Booking not sent', results[0]?.error?.message ?? 'Please try again.');
      return;
    }
    notify(
      ok === 1 ? 'Request sent' : `${ok} bookings requested`,
      ok < bookable.length ? `${bookable.length - ok} of the times were just taken.` : "We'll confirm shortly.",
    );
    setKind(null);
    setPicked([]);
    setRepeatWeeks(1);
    setDogIds([]);
    setNotes('');
    router.navigate('/(customer)');
  }

  if (profile && !profile.approved) {
    return (
      <View style={styles.centered}>
        <Text style={text.title}>Booking opens after your meet and greet</Text>
        <Text style={[text.muted, { textAlign: 'center', marginTop: 6 }]}>We'll be in touch to arrange it.</Text>
      </View>
    );
  }

  if (dogs.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={text.title}>Add your dog first</Text>
        <Button title="Add a dog" onPress={() => router.navigate('/(customer)/dogs')} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <SectionTitle>Service</SectionTitle>
      {(Object.keys(kinds) as ServiceKind[]).map((k) => (
        <Card key={k} selected={kind === k} onPress={() => setKind(k)}>
          <View style={styles.serviceRow}>
            <View style={[styles.serviceIcon, { backgroundColor: kinds[k].tint }]}>
              <Ionicons name={kinds[k].icon} size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={text.title}>{kinds[k].title}</Text>
              <Text style={text.muted}>{kinds[k].blurb}</Text>
            </View>
          </View>
        </Card>
      ))}

      {kind && (
        <>
          <SectionTitle>Length</SectionTitle>
          <View style={styles.wrap}>
            {([30, 60] as const).map((d) => {
              const s = services.find((x) => x.kind === kind && x.duration_min === d);
              if (!s) return null;
              return (
                <Chip key={d} label={`${d === 30 ? '30 min' : '1 hour'} · ${formatPrice(s.price_pence)}`}
                  selected={duration === d} onPress={() => setDuration(d)} />
              );
            })}
          </View>

          <SectionTitle>Dogs</SectionTitle>
          <View style={styles.wrap}>
            {dogs.map((dog) => (
              <Chip key={dog.id} label={dog.name} selected={dogIds.includes(dog.id)} onPress={() => toggleDog(dog.id)} />
            ))}
          </View>
          {service && dogIds.length > service.max_dogs && (
            <Text style={text.error}>Up to {service.max_dogs} dogs per booking for this service.</Text>
          )}

          <SectionTitle>Dates</SectionTitle>
          <Text style={[text.muted, { marginBottom: 8 }]}>Tap as many days as you like.</Text>
          <Calendar today={today} maxDate={maxDate} selected={picked} repeated={repeated} isDisabled={isDisabled} onToggle={togglePick} />

          <SectionTitle>Repeat</SectionTitle>
          <View style={styles.wrap}>
            {REPEATS.map((r) => (
              <Chip key={r.weeks} label={r.label} selected={repeatWeeks === r.weeks} onPress={() => setRepeatWeeks(r.weeks)} />
            ))}
          </View>
          {dates.length > 0 && (
            <Text style={text.muted}>
              {dates.length} {dates.length === 1 ? 'date' : 'dates'}: {dates.slice(0, 6).map((d) => formatDay(new Date(`${d}T12:00:00Z`))).join(', ')}
              {dates.length > 6 ? ` and ${dates.length - 6} more` : ''}
            </Text>
          )}

          <SectionTitle>Time</SectionTitle>
          {dates.length === 0 ? (
            <Text style={text.muted}>Pick at least one date to see free times.</Text>
          ) : loadingSlots ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
          ) : allDays.length === 0 && someDays.length === 0 ? (
            <Text style={text.muted}>No free times on these dates. Try other days.</Text>
          ) : (
            <>
              {dates.length > 1 && allDays.length > 0 && <Text style={[text.muted, { marginBottom: 6 }]}>Free on every date</Text>}
              <View style={styles.wrap}>
                {allDays.map((t) => <Chip key={t} label={t} selected={time === t} onPress={() => setTime(t)} />)}
              </View>
              {someDays.length > 0 && (
                <>
                  <Text style={[text.muted, { marginVertical: 6 }]}>Free on some dates only</Text>
                  <View style={styles.wrap}>
                    {someDays.map(({ t, n }) => (
                      <Chip key={t} label={`${t} (${n} of ${dates.length})`} selected={time === t} onPress={() => setTime(t)} />
                    ))}
                  </View>
                </>
              )}
            </>
          )}

          <SectionTitle>Payment</SectionTitle>
          <Card selected={payment === 'card'} onPress={() => setPayment('card')}>
            <Text style={text.title}>Pay by card</Text>
            <Text style={text.muted}>Your card is only charged once each booking is confirmed.</Text>
          </Card>
          {profile?.invoice_allowed && (
            <Card selected={payment === 'invoice'} onPress={() => setPayment('invoice')}>
              <Text style={text.title}>Pay later by invoice</Text>
              <Text style={text.muted}>We'll email you an invoice after your bookings are confirmed.</Text>
            </Card>
          )}

          <Field label="Anything we should know? (optional)" value={notes} onChangeText={setNotes} multiline />

          {time && bookable.length > 0 && (
            <View style={styles.summary}>
              <Text style={styles.summaryText}>
                {bookable.length} × {service?.name} at {time}
              </Text>
              <Text style={styles.summaryTotal}>{formatPrice(total)}</Text>
            </View>
          )}
          <Button
            title={bookable.length > 1 ? `Request ${bookable.length} bookings` : 'Request booking'}
            onPress={submit}
            loading={submitting}
            disabled={!service || !time || bookable.length === 0 || dogIds.length === 0 || (!!service && dogIds.length > service.max_dogs)}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: colors.background },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  serviceIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  summary: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8,
    padding: 14, borderRadius: 16, backgroundColor: colors.primaryLight,
  },
  summaryText: { fontFamily: fonts.medium, fontSize: 15, color: colors.text, flexShrink: 1 },
  summaryTotal: { fontFamily: fonts.bold, fontSize: 18, color: colors.primary, marginLeft: 8 },
});
