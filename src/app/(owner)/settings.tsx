import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { Button, Card, colors, Field, SectionTitle, text } from '../../components/ui';
import { notify } from '../../lib/dialog';
import { supabase } from '../../lib/supabase';
import type { Service } from '../../lib/types';

type WorkingHours = { id: string; weekday: number; start_time: string; end_time: string };
const contactFields: { key: string; label: string; multiline?: boolean; keyboard?: 'phone-pad' | 'email-address' }[] = [
  { key: 'about', label: 'About the business', multiline: true },
  { key: 'phone', label: 'Phone', keyboard: 'phone-pad' },
  { key: 'whatsapp', label: 'WhatsApp number', keyboard: 'phone-pad' },
  { key: 'email', label: 'Email', keyboard: 'email-address' },
  { key: 'instagram', label: 'Instagram name' },
  { key: 'facebook', label: 'Facebook page' },
  { key: 'service_area', label: 'Areas you cover', multiline: true },
  { key: 'hours_note', label: 'Opening hours note', multiline: true },
];
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Settings() {
  const [services, setServices] = useState<Service[]>([]);
  const [hours, setHours] = useState<WorkingHours[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { price: string; maxDogs: string }>>({});
  const [offFrom, setOffFrom] = useState('');
  const [contact, setContact] = useState<Record<string, string>>({});
  const [savingContact, setSavingContact] = useState(false);
  const [offTo, setOffTo] = useState('');
  const [perSlot, setPerSlot] = useState('3');
  const [noticeHours, setNoticeHours] = useState('24');

  const load = useCallback(async () => {
    const [{ data: s }, { data: h }, { data: b }] = await Promise.all([
      supabase.from('services').select('*').order('kind').order('duration_min'),
      supabase.from('working_hours').select('*').order('weekday'),
      supabase.from('business_info').select('*').eq('id', 1).single(),
    ]);
    if (b) {
      const info = b as Record<string, unknown>;
      setPerSlot(String(info.max_walks_per_slot ?? 3));
      setNoticeHours(String(info.cancel_notice_hours ?? 24));
      setContact(Object.fromEntries(contactFields.map((f) => [f.key, String(info[f.key] ?? '')])));
    }
    const list = (s as Service[]) ?? [];
    setServices(list);
    setHours((h as WorkingHours[]) ?? []);
    setDrafts(Object.fromEntries(list.map((x) => [x.id, { price: (x.price_pence / 100).toFixed(2), maxDogs: String(x.max_dogs) }])));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function saveService(s: Service, patch: Partial<Service>) {
    const { error } = await supabase.from('services').update(patch).eq('id', s.id);
    if (error) notify('Could not save', error.message);
    load();
  }

  async function saveHours(weekday: number, value: string) {
    // Format "08:00-18:00", or blank for a day off.
    const existing = hours.filter((h) => h.weekday === weekday);
    if (existing.length) await supabase.from('working_hours').delete().in('id', existing.map((h) => h.id));
    const match = value.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    if (match) {
      const { error } = await supabase.from('working_hours').insert({ weekday, start_time: match[1], end_time: match[2] });
      if (error) notify('Could not save hours', error.message);
    } else if (value.trim()) {
      notify('Use the format 08:00-18:00, or leave blank for a day off');
    }
    load();
  }

  async function saveCapacity() {
    const n = parseInt(perSlot, 10);
    const h = parseInt(noticeHours, 10);
    if (!(n >= 1 && n <= 20)) {
      notify('Check the number', 'Visits per part of the day: choose between 1 and 20.');
      return;
    }
    if (!(h >= 0 && h <= 168)) {
      notify('Check the number', 'Cancellation notice: choose between 0 and 168 hours.');
      return;
    }
    const { error } = await supabase.from('business_info').update({ max_walks_per_slot: n, cancel_notice_hours: h }).eq('id', 1);
    if (error) notify('Could not save', error.message);
    else notify('Saved', `Up to ${n} ${n === 1 ? 'visit' : 'visits'} per part of the day. Inside ${h} hours, customers ask you before cancelling.`);
  }

  async function saveContact() {
    setSavingContact(true);
    const patch = Object.fromEntries(contactFields.map((f) => [f.key, contact[f.key]?.trim() || null]));
    const { error } = await supabase.from('business_info').update(patch).eq('id', 1);
    setSavingContact(false);
    if (error) notify('Could not save', error.message);
    else notify('Contact details saved', 'Customers see them on the Contact page.');
  }

  async function addTimeOff() {
    // Dates as YYYY-MM-DD, inclusive, London time.
    const starts = new Date(`${offFrom}T00:00:00`);
    const ends = new Date(`${offTo || offFrom}T23:59:59`);
    if (isNaN(starts.getTime()) || isNaN(ends.getTime())) {
      notify('Use dates like 2026-12-24');
      return;
    }
    const { error } = await supabase.from('time_off').insert({ starts_at: starts.toISOString(), ends_at: ends.toISOString(), reason: 'Time off' });
    if (error) notify('Could not save', error.message);
    else {
      notify('Time off added');
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
                <Field label={s.kind === 'group_walk' ? 'Price per dog (£)' : 'Price (£)'} value={d.price} onChangeText={(price) => setDraft({ price })} keyboardType="decimal-pad" />
              </View>
              {s.kind !== 'solo_walk' && (
                <View style={{ flex: 1 }}>
                  <Field label="Max dogs" value={d.maxDogs} onChangeText={(maxDogs) => setDraft({ maxDogs })} keyboardType="number-pad" />
                </View>
              )}
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

      <SectionTitle>Availability</SectionTitle>
      <Text style={[text.muted, { marginBottom: 8 }]}>
        Most visits you'll take in each part of the day (morning, afternoon, evening). Group walks of the same type count as one.
      </Text>
      <Field label="Visits per part of the day" value={perSlot} onChangeText={setPerSlot} keyboardType="number-pad" />
      <Field label="Cancellation notice (hours)" value={noticeHours} onChangeText={setNoticeHours} keyboardType="number-pad" />
      <Text style={[text.muted, { marginBottom: 8, marginTop: -4 }]}>
        Closer to the walk than this, customers can only ask to cancel and you decide.
      </Text>
      <Button title="Save availability" variant="secondary" onPress={saveCapacity} />

      <SectionTitle>Time off</SectionTitle>
      <Field label="From (YYYY-MM-DD)" value={offFrom} onChangeText={setOffFrom} />
      <Field label="To (YYYY-MM-DD, optional)" value={offTo} onChangeText={setOffTo} />
      <Button title="Block these days" onPress={addTimeOff} disabled={!offFrom} />

      <SectionTitle>Contact page</SectionTitle>
      <Text style={[text.muted, { marginBottom: 8 }]}>What customers see when they tap Contact. Leave a box empty to hide it.</Text>
      {contactFields.map((f) => (
        <Field key={f.key} label={f.label} value={contact[f.key] ?? ''} onChangeText={(v) => setContact({ ...contact, [f.key]: v })}
          multiline={f.multiline} keyboardType={f.keyboard} autoCapitalize={f.keyboard ? 'none' : undefined} />
      ))}
      <Button title="Save contact details" onPress={saveContact} loading={savingContact} />

      <SectionTitle>Account</SectionTitle>
      <Button variant="secondary" title="Sign out" onPress={async () => { await supabase.auth.signOut(); router.replace('/sign-in'); }} />
    </ScrollView>
  );
}
