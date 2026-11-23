import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { Button, Card, colors, Field, SectionTitle, text } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import type { Service } from '../../lib/types';

type WorkingHours = { id: string; weekday: number; start_time: string; end_time: string };
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Settings() {
  const [services, setServices] = useState<Service[]>([]);
  const [hours, setHours] = useState<WorkingHours[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { price: string; maxDogs: string }>>({});
  const [offFrom, setOffFrom] = useState('');
  const [offTo, setOffTo] = useState('');

  const load = useCallback(async () => {
    const [{ data: s }, { data: h }] = await Promise.all([
      supabase.from('services').select('*').order('kind').order('duration_min'),
      supabase.from('working_hours').select('*').order('weekday'),
    ]);
    const list = (s as Service[]) ?? [];
    setServices(list);
    setHours((h as WorkingHours[]) ?? []);
    setDrafts(Object.fromEntries(list.map((x) => [x.id, { price: (x.price_pence / 100).toFixed(2), maxDogs: String(x.max_dogs) }])));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function saveService(s: Service, patch: Partial<Service>) {
    const { error } = await supabase.from('services').update(patch).eq('id', s.id);
    if (error) Alert.alert('Could not save', error.message);
    load();
  }

  async function saveHours(weekday: number, value: string) {
    // Format "08:00-18:00", or blank for a day off.
    const existing = hours.filter((h) => h.weekday === weekday);
    if (existing.length) await supabase.from('working_hours').delete().in('id', existing.map((h) => h.id));
    const match = value.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    if (match) {
      const { error } = await supabase.from('working_hours').insert({ weekday, start_time: match[1], end_time: match[2] });
      if (error) Alert.alert('Could not save hours', error.message);
    } else if (value.trim()) {
      Alert.alert('Use the format 08:00-18:00, or leave blank for a day off');
    }
    load();
  }

  async function addTimeOff() {
    // Dates as YYYY-MM-DD, inclusive, London time.
    const starts = new Date(`${offFrom}T00:00:00`);
    const ends = new Date(`${offTo || offFrom}T23:59:59`);
    if (isNaN(starts.getTime()) || isNaN(ends.getTime())) {
      Alert.alert('Use dates like 2026-12-24');
      return;
    }
    const { error } = await supabase.from('time_off').insert({ starts_at: starts.toISOString(), ends_at: ends.toISOString(), reason: 'Time off' });
    if (error) Alert.alert('Could not save', error.message);
    else {
      Alert.alert('Time off added');
      setOffFrom('');
      setOffTo('');
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <SectionTitle>Services and prices</SectionTitle>
      {services.map((s) => {
        const d = drafts[s.id] ?? { price: '', maxDogs: '' };
        const setDraft = (patch: Partial<typeof d>) => setDrafts({ ...drafts, [s.id]: { ...d, ...patch } });
        return (
          <Card key={s.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={text.title}>{s.name}</Text>
              <Switch value={s.active} onValueChange={(active) => saveService(s, { active })} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Field label="Price (£)" value={d.price} onChangeText={(price) => setDraft({ price })} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Max dogs" value={d.maxDogs} onChangeText={(maxDogs) => setDraft({ maxDogs })} keyboardType="number-pad" />
              </View>
            </View>
            <Button
              variant="secondary"
              title="Save"
              onPress={() => saveService(s, { price_pence: Math.round(parseFloat(d.price || '0') * 100), max_dogs: parseInt(d.maxDogs || '1', 10) })}
            />
          </Card>
        );
      })}

      <SectionTitle>Working hours</SectionTitle>
      <Text style={[text.muted, { marginBottom: 8 }]}>Type hours like 08:00-18:00. Leave blank for a day off.</Text>
      {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
        const h = hours.find((x) => x.weekday === wd);
        return (
          <Field
            key={`${wd}-${h?.id ?? 'off'}`}
            label={weekdays[wd]}
            defaultValue={h ? `${h.start_time.slice(0, 5)}-${h.end_time.slice(0, 5)}` : ''}
            placeholder="Day off"
            onEndEditing={(e) => saveHours(wd, e.nativeEvent.text)}
          />
        );
      })}

      <SectionTitle>Time off</SectionTitle>
      <Field label="From (YYYY-MM-DD)" value={offFrom} onChangeText={setOffFrom} />
      <Field label="To (YYYY-MM-DD, optional)" value={offTo} onChangeText={setOffTo} />
      <Button title="Block these days" onPress={addTimeOff} disabled={!offFrom} />

      <SectionTitle>Account</SectionTitle>
      <Button variant="secondary" title="Sign out" onPress={async () => { await supabase.auth.signOut(); router.replace('/sign-in'); }} />
    </ScrollView>
  );
}
