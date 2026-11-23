import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { addDays, Calendar, weekdayOf } from '../../components/Calendar';
import { DogAvatar } from '../../components/DogAvatar';
import { Button, Card, Chip, colors, Field, fonts, text } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { notify } from '../../lib/dialog';
import { formatDay, formatPrice, formatTime, londonDateKey } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import type { Dog, PaymentMethod, Service, ServiceKind } from '../../lib/types';

/*
 * Booking is one question per step:
 *   1 What  - service and length
 *   2 Who   - which dogs (skipped when there's only one)
 *   3 When  - a one-off date, or the same weekdays every week
 *   4 Time  - one time for every date
 *   5 Check - summary, payment, notes, send
 */

const kinds: Record<ServiceKind, { title: string; blurb: string; icon: 'walk' | 'people' | 'home'; tint: string }> = {
  solo_walk: { title: 'Solo walk', blurb: 'One-to-one walk for your dog', icon: 'walk', tint: colors.primary },
  group_walk: { title: 'Group walk', blurb: 'With a small group of friendly dogs', icon: 'people', tint: colors.accent },
  sit_in: { title: 'Sit-in', blurb: 'A home visit to feed and keep your dog company', icon: 'home', tint: colors.blue },
};

const BOOK_AHEAD_DAYS = 90;
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_OPTIONS = [4, 8, 12];
const STEPS = ['What', 'Who', 'When', 'Time', 'Check'] as const;

const newBatchId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

const dayLabel = (key: string) => formatDay(new Date(`${key}T12:00:00Z`));

export default function Book() {
  const { session, profile } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<ServiceKind | null>(null);
  const [duration, setDuration] = useState<30 | 60>(60);
  const [dogIds, setDogIds] = useState<string[]>([]);
  const [often, setOften] = useState<'once' | 'weekly'>('once');
  const [onceDate, setOnceDate] = useState<string | null>(null);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [weeks, setWeeks] = useState(4);
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
        if (data) setWorkingDays([...new Set((data as { weekday: number }[]).map((w) => w.weekday))].sort());
      });
      if (session) {
        supabase.from('dogs').select('*').eq('owner_id', session.user.id).order('name').then(({ data }) => {
          const list = (data as Dog[]) ?? [];
          setDogs(list);
          if (list.length === 1) setDogIds([list[0].id]);
        });
      }
    }, [session]),
  );

  const service = useMemo(
    () => services.find((s) => s.kind === kind && s.duration_min === duration) ?? null,
    [services, kind, duration],
  );
  const dogCount = Math.max(dogIds.length, 1);
  const skipWho = dogs.length === 1;

  // The dates this booking covers.
  const dates = useMemo(() => {
    if (often === 'once') return onceDate ? [onceDate] : [];
    if (weekdays.length === 0) return [];
    const out: string[] = [];
    const start = addDays(today, 1);
    for (let key = start; key < addDays(start, weeks * 7) && key <= maxDate; key = addDays(key, 1)) {
      if (weekdays.includes(weekdayOf(key))) out.push(key);
    }
    return out;
  }, [often, onceDate, weekdays, weeks, today, maxDate]);

  // Free times for each date, as London "HH:MM" -> ISO start.
  useEffect(() => {
    if (step !== 3 || !service || dates.length === 0) return;
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
  }, [step, service, dates, dogCount]);

  // Every time that's free on at least one date, with how many dates it suits.
  const times = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of dates) for (const t of Object.keys(slotsByDate[d] ?? {})) counts[t] = (counts[t] ?? 0) + 1;
    return Object.keys(counts).sort().map((t) => ({ t, n: counts[t] }));
  }, [slotsByDate, dates]);
  const bookable = time ? dates.filter((d) => slotsByDate[d]?.[time]) : [];
  const clashes = time ? dates.filter((d) => !slotsByDate[d]?.[time]) : [];
  const total = service ? service.price_pence * bookable.length : 0;

  const canNext = [
    !!service,
    dogIds.length > 0 && (!service || dogIds.length <= service.max_dogs),
    dates.length > 0,
    !!time && bookable.length > 0,
    true,
  ][step];

  function go(to: number) {
    if (to === 1 && skipWho) to = step < 1 ? 2 : 0;
    if (to === 3) setTime(null);
    setStep(Math.max(0, Math.min(4, to)));
  }

  function reset() {
    setStep(0);
    setKind(null);
    setOnceDate(null);
    setWeekdays([]);
    setTime(null);
    setNotes('');
    if (!skipWho) setDogIds([]);
  }

  async function submit() {
    if (!service || !time || bookable.length === 0) return;
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
    reset();
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

  const visibleSteps = STEPS.map((label, i) => ({ label, i })).filter((s) => !(skipWho && s.i === 1));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.progress}>
        {visibleSteps.map(({ label, i }) => (
          <Pressable key={label} onPress={() => i < step && go(i)} disabled={i >= step} style={styles.progressItem}>
            <View style={[styles.progressDot, i <= step && styles.progressDotOn]}>
              {i < step ? <Ionicons name="checkmark" size={14} color="#fff" /> : <Text style={[styles.progressNum, i === step && { color: '#fff' }]}>{visibleSteps.findIndex((s) => s.i === i) + 1}</Text>}
            </View>
            <Text style={[styles.progressLabel, i === step && { color: colors.primary }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {step === 0 && (
          <>
            <Text style={styles.question}>What would you like to book?</Text>
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
                {kind === k && (
                  <View style={[styles.wrap, { marginTop: 12 }]}>
                    {([30, 60] as const).map((d) => {
                      const s = services.find((x) => x.kind === k && x.duration_min === d);
                      if (!s) return null;
                      return (
                        <Chip key={d} label={`${d === 30 ? '30 min' : '1 hour'} · ${formatPrice(s.price_pence)}`}
                          selected={duration === d} onPress={() => setDuration(d)} />
                      );
                    })}
                  </View>
                )}
              </Card>
            ))}
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.question}>Who's coming?</Text>
            {dogs.map((dog, i) => (
              <Card key={dog.id} selected={dogIds.includes(dog.id)}
                onPress={() => setDogIds((ids) => (ids.includes(dog.id) ? ids.filter((d) => d !== dog.id) : [...ids, dog.id]))}>
                <View style={styles.serviceRow}>
                  <DogAvatar uri={dog.photo_url} size={48} index={i} />
                  <Text style={[text.title, { flex: 1 }]}>{dog.name}</Text>
                  {dogIds.includes(dog.id) && <Ionicons name="checkmark-circle" size={26} color={colors.primary} />}
                </View>
              </Card>
            ))}
            {service && dogIds.length > service.max_dogs && (
              <Text style={text.error}>Up to {service.max_dogs} dogs per booking for this service.</Text>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.question}>When?</Text>
            <View style={styles.segment}>
              {(['once', 'weekly'] as const).map((o) => (
                <Pressable key={o} onPress={() => setOften(o)} style={[styles.segmentItem, often === o && styles.segmentOn]}>
                  <Text style={[styles.segmentText, often === o && { color: '#fff' }]}>{o === 'once' ? 'Just once' : 'Every week'}</Text>
                </Pressable>
              ))}
            </View>

            {often === 'once' ? (
              <Calendar
                today={today}
                maxDate={maxDate}
                selected={onceDate ? [onceDate] : []}
                isDisabled={(key) => !workingDays.includes(weekdayOf(key))}
                onToggle={(key) => setOnceDate(key === onceDate ? null : key)}
              />
            ) : (
              <Card>
                <Text style={styles.subQuestion}>Which days?</Text>
                <View style={styles.wrap}>
                  {workingDays.map((wd) => (
                    <Chip key={wd} label={WEEKDAY_NAMES[wd]} selected={weekdays.includes(wd)}
                      onPress={() => setWeekdays((w) => (w.includes(wd) ? w.filter((x) => x !== wd) : [...w, wd].sort()))} />
                  ))}
                </View>
                <Text style={[styles.subQuestion, { marginTop: 8 }]}>For how long?</Text>
                <View style={styles.wrap}>
                  {WEEK_OPTIONS.map((w) => (
                    <Chip key={w} label={`${w} weeks`} selected={weeks === w} onPress={() => setWeeks(w)} />
                  ))}
                </View>
              </Card>
            )}
            {dates.length > 0 && (
              <Text style={[text.muted, { marginTop: 8 }]}>
                {often === 'once'
                  ? dayLabel(dates[0])
                  : `${dates.length} ${service ? kinds[service.kind].title.toLowerCase() : 'booking'}s, from ${dayLabel(dates[0])} to ${dayLabel(dates[dates.length - 1])}`}
              </Text>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.question}>What time suits you?</Text>
            {dates.length > 1 && <Text style={[text.muted, { marginBottom: 8 }]}>We'll use the same time for all {dates.length} dates.</Text>}
            {loadingSlots ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
            ) : times.length === 0 ? (
              <Text style={text.muted}>Sorry, nothing's free then. Go back and try other days.</Text>
            ) : (
              <>
                {[
                  { label: 'Morning', match: (t: string) => t < '12:00' },
                  { label: 'Afternoon', match: (t: string) => t >= '12:00' },
                ].map((part) => {
                  const list = times.filter((x) => part.match(x.t));
                  if (list.length === 0) return null;
                  return (
                    <View key={part.label} style={{ marginBottom: 8 }}>
                      <Text style={styles.subQuestion}>{part.label}</Text>
                      <View style={styles.wrap}>
                        {list.map(({ t, n }) => (
                          <Chip key={t} label={n < dates.length ? `${t} *` : t} selected={time === t} onPress={() => setTime(t)} />
                        ))}
                      </View>
                    </View>
                  );
                })}
                {times.some((x) => x.n < dates.length) && (
                  <Text style={text.muted}>* Not free on every date.</Text>
                )}
                {time && clashes.length > 0 && (
                  <View style={styles.clash}>
                    <Ionicons name="alert-circle" size={20} color={colors.accent} />
                    <Text style={[text.body, { flex: 1 }]}>
                      {time} is taken on {clashes.map(dayLabel).join(', ')}. We'll book the other {bookable.length}.
                    </Text>
                  </View>
                )}
              </>
            )}
          </>
        )}

        {step === 4 && service && time && (
          <>
            <Text style={styles.question}>Check and send</Text>
            <Card>
              <View style={styles.serviceRow}>
                <View style={[styles.serviceIcon, { backgroundColor: kinds[service.kind].tint }]}>
                  <Ionicons name={kinds[service.kind].icon} size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={text.title}>{service.name}</Text>
                  <Text style={text.muted}>{dogs.filter((d) => dogIds.includes(d.id)).map((d) => d.name).join(', ')}</Text>
                </View>
              </View>
              <Text style={[text.body, { marginTop: 10 }]}>
                {bookable.length === 1 ? `${dayLabel(bookable[0])} at ${time}` : `${bookable.length} dates at ${time}`}
              </Text>
              {bookable.length > 1 && <Text style={text.muted}>{bookable.map(dayLabel).join(', ')}</Text>}
              <View style={styles.totalRow}>
                <Text style={text.body}>Total</Text>
                <Text style={styles.total}>{formatPrice(total)}</Text>
              </View>
            </Card>

            <Text style={styles.subQuestion}>How would you like to pay?</Text>
            <Card selected={payment === 'card'} onPress={() => setPayment('card')}>
              <Text style={text.title}>Pay by card</Text>
              <Text style={text.muted}>Only charged once your booking is confirmed.</Text>
            </Card>
            {profile?.invoice_allowed && (
              <Card selected={payment === 'invoice'} onPress={() => setPayment('invoice')}>
                <Text style={text.title}>Pay later by invoice</Text>
                <Text style={text.muted}>We'll email you an invoice after it's confirmed.</Text>
              </Card>
            )}
            <Field label="Anything we should know? (optional)" value={notes} onChangeText={setNotes} multiline />
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 && (
          <View style={{ flex: 1 }}>
            <Button variant="secondary" title="Back" onPress={() => go(step - 1)} />
          </View>
        )}
        <View style={{ flex: 2 }}>
          {step < 4 ? (
            <Button title="Next" onPress={() => go(step + 1)} disabled={!canNext} />
          ) : (
            <Button
              title={bookable.length > 1 ? `Request ${bookable.length} bookings` : 'Request booking'}
              onPress={submit}
              loading={submitting}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: colors.background },
  progress: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 12, paddingHorizontal: 8 },
  progressItem: { alignItems: 'center', gap: 4, minWidth: 52 },
  progressDot: {
    width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border,
  },
  progressDotOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  progressNum: { fontFamily: fonts.bold, fontSize: 13, color: colors.muted },
  progressLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  question: { fontFamily: fonts.display, fontSize: 30, color: colors.text, marginBottom: 12 },
  subQuestion: { fontFamily: fonts.bold, fontSize: 16, color: colors.text, marginBottom: 8, marginTop: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  serviceIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', backgroundColor: colors.primaryLight, borderRadius: 24, padding: 4, marginBottom: 12 },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 20, alignItems: 'center' },
  segmentOn: { backgroundColor: colors.primary },
  segmentText: { fontFamily: fonts.bold, fontSize: 16, color: colors.primary },
  clash: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#FFF1E8', borderRadius: 14, padding: 12, marginTop: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  total: { fontFamily: fonts.bold, fontSize: 20, color: colors.primary },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
});
