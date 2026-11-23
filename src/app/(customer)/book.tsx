import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Chip, colors, Field, SectionTitle, text } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDay, formatPrice, formatTime, londonDateKey, upcomingDays } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import type { Dog, PaymentMethod, Service, ServiceKind } from '../../lib/types';

const kindLabels: Record<ServiceKind, { title: string; blurb: string }> = {
  solo_walk: { title: 'Solo walk', blurb: 'One-to-one walk for your dog' },
  group_walk: { title: 'Group walk', blurb: 'Walk with a small group of friendly dogs' },
  sit_in: { title: 'Sit-in', blurb: 'A visit to your home to feed and keep your dog company' },
};

const DAYS_AHEAD = 28;

export default function Book() {
  const { session, profile } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [kind, setKind] = useState<ServiceKind | null>(null);
  const [duration, setDuration] = useState<30 | 60>(60);
  const [day, setDay] = useState(() => londonDateKey(new Date()));
  const [dogIds, setDogIds] = useState<string[]>([]);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>('card');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      supabase.from('services').select('*').eq('active', true).then(({ data }) => setServices((data as Service[]) ?? []));
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
  const days = useMemo(() => upcomingDays(DAYS_AHEAD), []);
  const dogCount = Math.max(dogIds.length, 1);

  useEffect(() => {
    setSlot(null);
    if (!service) {
      setSlots(null);
      return;
    }
    let stale = false;
    setSlots(null);
    supabase
      .rpc('available_slots', { p_service_id: service.id, p_date: day, p_dog_count: dogCount })
      .then(({ data }) => {
        if (!stale) setSlots(((data as { starts_at: string }[]) ?? []).map((r) => r.starts_at));
      });
    return () => { stale = true; };
  }, [service, day, dogCount]);

  function toggleDog(id: string) {
    setDogIds((ids) => (ids.includes(id) ? ids.filter((d) => d !== id) : [...ids, id]));
  }

  async function submit() {
    if (!service || !slot || dogIds.length === 0) return;
    setSubmitting(true);
    const { error } = await supabase.rpc('request_booking', {
      p_service_id: service.id,
      p_starts_at: slot,
      p_dog_ids: dogIds,
      p_payment_method: payment,
      p_notes: notes || null,
    });
    setSubmitting(false);
    if (error) {
      Alert.alert('Booking not sent', error.message);
      return;
    }
    // TODO(stripe): for card payments, collect and save the card here before confirming.
    Alert.alert('Request sent', "We'll confirm your booking shortly.");
    setKind(null);
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
      {(Object.keys(kindLabels) as ServiceKind[]).map((k) => (
        <Card key={k} selected={kind === k} onPress={() => setKind(k)}>
          <Text style={text.title}>{kindLabels[k].title}</Text>
          <Text style={text.muted}>{kindLabels[k].blurb}</Text>
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

          <SectionTitle>Day</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {days.map((d) => {
              const key = londonDateKey(d);
              return <Chip key={key} label={formatDay(d)} selected={day === key} onPress={() => setDay(key)} />;
            })}
          </ScrollView>

          <SectionTitle>Time</SectionTitle>
          {slots === null ? (
            <ActivityIndicator style={{ marginVertical: 12 }} />
          ) : slots.length === 0 ? (
            <Text style={text.muted}>No free times on this day. Try another day.</Text>
          ) : (
            <View style={styles.wrap}>
              {slots.map((s) => (
                <Chip key={s} label={formatTime(s)} selected={slot === s} onPress={() => setSlot(s)} />
              ))}
            </View>
          )}

          <SectionTitle>Payment</SectionTitle>
          <Card selected={payment === 'card'} onPress={() => setPayment('card')}>
            <Text style={text.title}>Pay by card</Text>
            <Text style={text.muted}>Your card is only charged once the booking is confirmed.</Text>
          </Card>
          {profile?.invoice_allowed && (
            <Card selected={payment === 'invoice'} onPress={() => setPayment('invoice')}>
              <Text style={text.title}>Pay later by invoice</Text>
              <Text style={text.muted}>We'll email you an invoice after the booking is confirmed.</Text>
            </Card>
          )}

          <Field label="Anything we should know? (optional)" value={notes} onChangeText={setNotes} multiline />

          <Button
            title={service ? `Request booking · ${formatPrice(service.price_pence)}` : 'Request booking'}
            onPress={submit}
            loading={submitting}
            disabled={!service || !slot || dogIds.length === 0 || (service && dogIds.length > service.max_dogs)}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: colors.background },
});
