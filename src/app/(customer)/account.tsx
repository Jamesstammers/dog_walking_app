import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Button, colors, Field } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

export default function Account() {
  const { profile, refreshProfile } = useAuth();
  const [form, setForm] = useState({ full_name: '', phone: '', address: '', postcode: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({ full_name: profile.full_name, phone: profile.phone ?? '', address: profile.address ?? '', postcode: profile.postcode ?? '' });
    }
  }, [profile]);

  async function save() {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update(form).eq('id', profile.id);
    setSaving(false);
    if (error) Alert.alert('Could not save', error.message);
    else {
      await refreshProfile();
      Alert.alert('Saved');
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/sign-in');
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16 }}>
      <Field label="Name" value={form.full_name} onChangeText={(full_name) => setForm({ ...form, full_name })} />
      <Field label="Phone" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} keyboardType="phone-pad" />
      <Field label="Address" value={form.address} onChangeText={(address) => setForm({ ...form, address })} multiline />
      <Field label="Postcode" value={form.postcode} onChangeText={(postcode) => setForm({ ...form, postcode })} autoCapitalize="characters" />
      <Button title="Save details" onPress={save} loading={saving} />
      <Button variant="secondary" title="Sign out" onPress={signOut} />
    </ScrollView>
  );
}
