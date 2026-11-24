import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { addDays, Calendar, weekdayOf } from '../../components/Calendar';
import { DogAvatar } from '../../components/DogAvatar';
import { Button, Card, Chip, colors, Field, fonts, text } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { notify } from '../../lib/dialog';
import { formatDay, formatPrice, londonDateKey, timeWindows } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import type { Dog, PaymentMethod, Service, ServiceKind, TimeWindow } from '../../lib/types';

/*
 * Booking is one question per step, starting with the date so availability is the first thing you see:
 *   1 When  - one or more dates, or the same weekdays every week (calendar shows free/full per part of day)
 *   2 Time  - morning, afternoon, evening or no preference, the same for every date or chosen per date
 *             (exact times go in the notes)
 *   3 What  - service and length
 *   4 Who   - which dogs (skipped when there's only one)
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
const STEPS = ['When', 'Time', 'What', 'Who', 'Check'] as const;
const WHO = 3;
type DayFree = [boolean, boolean, boolean];
const WINDOW_INDEX: Record<Exclude<TimeWindow, 'any'>, number> = { morning: 0, afternoon: 1, evening: 2 };
const windowTints: Record<TimeWindow, string> = {
  morning: colors.accent,
  afternoon: colors.pink,
  evening: colors.primary,
  any: colors.blue,
};

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
  const [picked, setPicked] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [availability, setAvailability] = useState<Record<string, DayFree>>({});
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [weeks, setWeeks] = useState(4);
  const [window, setWindow] = useState<TimeWindow | null>(null);
  const [sameTime, setSameTime] = useState(true);
  const [perDate, setPerDate] = useState<Record<string, TimeWindow>>({});
  const [payment, setPayment] = useState<PaymentMethod>('card');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const today = londonDateKey(new Date());
  const maxDate = addDays(today, BOOK_AHEAD_DAYS);

  useFocusEffect(
    useCallback(() => {
      supabase.from('services').select('*').eq('active', true).then(({ data }) => setServices((data as Service[]) ?? []));
      supabase.rpc('blocked_dates', { p_from: today, p_to: maxDate }).then(({ data }) => setBlocked((data as string[]) ?? []));
      supabase.rpc('day_availability', { p_from: addDays(today, 1), p_to: maxDate }).then(({ data }) => {
        const map: Record<string, DayFree> = {};
        for (const r of (data as { day: string; bookable: boolean; morning: boolean; afternoon: boolean; evening: boolean }[]) ?? []) {
          map[r.day] = r.bookable ? [r.morning, r.afternoon, r.evening] : [false, false, false];
        }
        setAvailability(map);
      });
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
    }, [session, today, maxDate]),
  );

  const service = useMemo(
    () => services.find((s) => s.kind === kind && s.duration_min === duration) ?? null,
    [services, kind, duration],
  );
  const skipWho = dogs.length === 1;
  // Bookable from tomorrow, on working days, outside her time off, and with room in at least one part of the day.
  const isDisabled = useCallback(
    (key: string) =>
      key <= today || !workingDays.includes(weekdayOf(key)) || blocked.includes(key)
      || (availability[key] ? !availability[key].some(Boolean) : false),
    [today, workingDays, blocked, availability],
  );
  const freeAt = useCallback(
    (key: string, w: TimeWindow) => {
      const a = availability[key];
      if (!a) return true; // not loaded yet; the server checks again on send
      return w === 'any' ? a.some(Boolean) : a[WINDOW_INDEX[w]];
    },
    [availability],
  );

  // The dates this booking covers.
  const dates = useMemo(() => {
    if (often === 'once') return [...picked].sort();
    if (weekdays.length === 0) return [];
    const out: string[] = [];
    const start = addDays(today, 1);
    for (let key = start; key < addDays(start, weeks * 7) && key <= maxDate; key = addDays(key, 1)) {
      if (weekdays.includes(weekdayOf(key)) && !isDisabled(key)) out.push(key);
    }
    return out;
  }, [often, picked, weekdays, weeks, today, maxDate, isDisabled]);

  // The dates that actually get booked: those with room at the chosen time of day.
  // One-off bookings of several dates can have a different time of day for each date.
  const eachDay = often === 'once' && dates.length > 1 && !sameTime;
  const windowFor = useCallback((d: string) => (eachDay ? perDate[d] ?? null : window), [eachDay, perDate, window]);
  const bookDates = useMemo(
    () => (eachDay ? dates.filter((d) => perDate[d] && freeAt(d, perDate[d])) : window ? dates.filter((d) => freeAt(d, window)) : dates),
    [eachDay, dates, perDate, window, freeAt],
  );
  const timeChosen = eachDay ? dates.every((d) => perDate[d]) : !!window;
  const perDog = service?.kind === 'group_walk'; // group walks are priced per dog; solo walks and sit-ins per visit
  const oneDog = service?.max_dogs === 1; // solo walks
  const perVisit = service ? service.price_pence * (perDog ? dogIds.length : 1) : 0;
  const total = perVisit * bookDates.length;

  const canNext = [
    dates.length > 0,
    timeChosen && bookDates.length > 0,
    !!service,
    dogIds.length > 0 && (!service || dogIds.length <= service.max_dogs),
    true,
  ][step];

  // Switching to a solo walk keeps just one of the dogs already picked.
  useEffect(() => {
    if (oneDog && dogIds.length > 1) setDogIds([dogIds[0]]);
  }, [oneDog, dogIds]);

  function go(to: number) {
    if (to === WHO && skipWho) to = step < WHO ? WHO + 1 : WHO - 1;
    setStep(Math.max(0, Math.min(4, to)));
  }

  function reset() {
    setStep(0);
    setKind(null);
    setPicked([]);
    setWeekdays([]);
    setWindow(null);
    setSameTime(true);
    setPerDate({});
    setNotes('');
    if (!skipWho) setDogIds([]);
  }

  async function submit() {
    if (!service || !timeChosen || bookDates.length === 0) return;
    setSubmitting(true);
    const batchId = bookDates.length > 1 ? newBatchId() : null;
    const results = await Promise.all(
      bookDates.map((d) =>
        supabase.rpc('request_booking', {
          p_service_id: service.id,
          p_date: d,
          p_time_window: windowFor(d),
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
      ok < bookDates.length
        ? `${bookDates.length - ok} couldn't be booked: ${results.find((r) => r.error)?.error?.message ?? ''}`
        : "We'll confirm shortly.",
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

  const visibleSteps = STEPS.map((label, i) => ({ label, i })).filter((s) => !(skipWho && s.i === WHO));

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
            <Text style={styles.question}>When?</Text>
            <View style={styles.segment}>
              {(['once', 'weekly'] as const).map((o) => (
                <Pressable key={o} onPress={() => setOften(o)} style={[styles.segmentItem, often === o && styles.segmentOn]}>
                  <Text style={[styles.segmentText, often === o && { color: '#fff' }]}>{o === 'once' ? 'Just once' : 'Every week'}</Text>
                </Pressable>
              ))}
            </View>

            {often === 'once' ? (
              <>
                <Text style={[text.muted, { marginBottom: 8 }]}>Tap every day you'd like a visit. Green dots show when she's free.</Text>
                <Calendar
                  today={today}
                  maxDate={maxDate}
                  selected={picked}
                  isDisabled={isDisabled}
                  availability={availability}
                  onToggle={(key) => setPicked((p) => (p.includes(key) ? p.filter((d) => d !== key) : [...p, key]))}
                />
              </>
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
            {often === 'weekly' && dates.length > 0 && (
              <Calendar today={today} maxDate={maxDate} selected={[]} repeated={dates} isDisabled={isDisabled}
                availability={availability} onToggle={() => {}} />
            )}
            {dates.length > 0 && (
              <Text style={[text.muted, { marginTop: 8 }]}>
                {dates.length === 1
                  ? dayLabel(dates[0])
                  : often === 'once'
                    ? `${dates.length} days: ${dates.map(dayLabel).join(', ')}`
                    : `${dates.length} visits, from ${dayLabel(dates[0])} to ${dayLabel(dates[dates.length - 1])}`}
              </Text>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.question}>What time of day?</Text>
            {often === 'once' && dates.length > 1 && (
              <View style={styles.segment}>
                {([true, false] as const).map((same) => (
                  <Pressable key={String(same)} onPress={() => setSameTime(same)} style={[styles.segmentItem, sameTime === same && styles.segmentOn]}>
                    <Text style={[styles.segmentText, sameTime === same && { color: '#fff' }]}>{same ? 'Same for all' : 'Each day'}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {eachDay && dates.map((d) => (
              <Card key={d}>
                <Text style={[text.title, { marginBottom: 6 }]}>{dayLabel(d)}</Text>
                <View style={styles.wrap}>
                  {(Object.keys(timeWindows) as TimeWindow[]).map((w) => (
                    <Chip key={w} label={w === 'any' ? 'Any time' : timeWindows[w].label} selected={perDate[d] === w}
                      disabled={!freeAt(d, w)} onPress={() => setPerDate((p) => ({ ...p, [d]: w }))} />
                  ))}
                </View>
              </Card>
            ))}
            {eachDay && <Text style={[text.muted, { marginTop: 4 }]}>Crossed-out times are full that day.</Text>}
            {!eachDay && dates.length > 1 && <Text style={[text.muted, { marginBottom: 8 }]}>This applies to all {dates.length} dates.</Text>}
            {!eachDay && (Object.keys(timeWindows) as TimeWindow[]).map((w) => {
              const free = dates.filter((d) => freeAt(d, w)).length;
              const full = dates.length - free;
              const none = free === 0;
              return (
              <Card key={w} selected={window === w} onPress={none ? undefined : () => setWindow(w)}>
                <View style={styles.serviceRow}>
                  <View style={[styles.serviceIcon, { backgroundColor: windowTints[w] }]}>
                    <Ionicons name={timeWindows[w].icon} size={22} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={text.title}>{timeWindows[w].label}</Text>
                    <Text style={text.muted}>{timeWindows[w].hours}</Text>
                    <Text style={[styles.avail, { color: full === 0 ? colors.free : none ? colors.muted : colors.accent }]}>
                      {full === 0
                        ? dates.length > 1 ? `Free on all ${dates.length} dates` : 'Free'
                        : none
                          ? dates.length > 1 ? 'Full on all these dates' : 'Full'
                          : `Free on ${free} of ${dates.length} dates`}
                    </Text>
                  </View>
                  {window === w && <Ionicons name="checkmark-circle" size={26} color={colors.primary} />}
                </View>
              </Card>
              );
            })}
            {!eachDay && window && bookDates.length < dates.length && bookDates.length > 0 && (
              <Text style={[text.muted, { marginTop: 4 }]}>
                {timeWindows[window].label} is full on {dates.filter((d) => !bookDates.includes(d)).map(dayLabel).join(', ')}, so we'll only request the other {bookDates.length}.
              </Text>
            )}
            <Text style={[text.muted, { marginTop: 4 }]}>Need a specific time? Add it in the notes on the next step.</Text>
          </>
        )}

        {step === 2 && (
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
                        <Chip key={d} label={`${d === 30 ? '30 min' : '1 hour'} · ${formatPrice(s.price_pence)}${k === 'group_walk' ? ' per dog' : ''}`}
                          selected={duration === d} onPress={() => setDuration(d)} />
                      );
                    })}
                  </View>
                )}
              </Card>
            ))}
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.question}>{oneDog ? 'Which dog?' : "Who's coming?"}</Text>
            {oneDog && (
              <Text style={[text.muted, { marginBottom: 8 }]}>A solo walk is one-to-one. To bring more than one dog, choose a group walk.</Text>
            )}
            {dogs.map((dog, i) => (
              <Card key={dog.id} selected={dogIds.includes(dog.id)}
                onPress={() => setDogIds((ids) => (oneDog ? [dog.id] : ids.includes(dog.id) ? ids.filter((d) => d !== dog.id) : [...ids, dog.id]))}>
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

        {step === 4 && service && timeChosen && (
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
              {eachDay ? (
                <View style={{ marginTop: 10 }}>
                  {bookDates.map((d) => (
                    <Text key={d} style={text.body}>{dayLabel(d)} · {timeWindows[perDate[d]].label}</Text>
                  ))}
                </View>
              ) : (
                <>
                  <Text style={[text.body, { marginTop: 10 }]}>
                    {bookDates.length === 1 ? dayLabel(bookDates[0]) : `${bookDates.length} dates`} · {window ? timeWindows[window].label : ''}
                  </Text>
                  {bookDates.length > 1 && <Text style={text.muted}>{bookDates.map(dayLabel).join(', ')}</Text>}
                </>
              )}
              {(perDog && dogIds.length > 1) || bookDates.length > 1 ? (
                <Text style={[text.muted, { marginTop: 10 }]}>
                  {formatPrice(service.price_pence)}
                  {perDog && dogIds.length > 1 ? ` × ${dogIds.length} dogs` : ''}
                  {bookDates.length > 1 ? ` × ${bookDates.length} dates` : ''}
                </Text>
              ) : null}
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
            <Field
              label="A specific time, or anything else we should know? (optional)"
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Around 10am please, key is under the mat"
              multiline
            />
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
              title={bookDates.length > 1 ? `Request ${bookDates.length} bookings` : 'Request booking'}
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
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  avail: { fontFamily: fonts.bold, fontSize: 13, marginTop: 2 },
  total: { fontFamily: fonts.bold, fontSize: 20, color: colors.primary },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
});
