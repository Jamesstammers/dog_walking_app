import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Switch, StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, Field, SectionTitle, text } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import type { Dog } from '../../lib/types';

const emptyDog = { name: '', breed: '', vet_details: '', notes: '', vaccinations_up_to_date: false, good_with_other_dogs: true };

export default function MyDogs() {
  const { session } = useAuth();
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [form, setForm] = useState<typeof emptyDog | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase.from('dogs').select('*').eq('owner_id', session.user.id).order('name');
    setDogs((data as Dog[]) ?? []);
  }, [session]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function edit(dog?: Dog) {
    setEditingId(dog?.id ?? null);
    setForm(dog ? {
      name: dog.name, breed: dog.breed ?? '', vet_details: dog.vet_details ?? '', notes: dog.notes ?? '',
      vaccinations_up_to_date: dog.vaccinations_up_to_date, good_with_other_dogs: dog.good_with_other_dogs,
    } : { ...emptyDog });
  }

  async function save() {
    if (!form || !session) return;
    setSaving(true);
    const row = { ...form, owner_id: session.user.id };
    const { error } = editingId
      ? await supabase.from('dogs').update(row).eq('id', editingId)
      : await supabase.from('dogs').insert(row);
    setSaving(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    setForm(null);
    load();
  }

  if (form) {
    const set = (patch: Partial<typeof emptyDog>) => setForm({ ...form, ...patch });
    return (
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16 }}>
        <Field label="Name" value={form.name} onChangeText={(name) => set({ name })} />
        <Field label="Breed" value={form.breed} onChangeText={(breed) => set({ breed })} />
        <Field label="Vet practice and phone" value={form.vet_details} onChangeText={(vet_details) => set({ vet_details })} />
        <Field label="Notes (allergies, recall, lead habits)" value={form.notes} onChangeText={(notes) => set({ notes })} multiline />
        <View style={styles.toggle}>
          <Text style={text.body}>Vaccinations up to date</Text>
          <Switch value={form.vaccinations_up_to_date} onValueChange={(v) => set({ vaccinations_up_to_date: v })} />
        </View>
        <View style={styles.toggle}>
          <Text style={text.body}>Good with other dogs</Text>
          <Switch value={form.good_with_other_dogs} onValueChange={(v) => set({ good_with_other_dogs: v })} />
        </View>
        <Button title="Save" onPress={save} loading={saving} disabled={!form.name.trim()} />
        <Button variant="secondary" title="Cancel" onPress={() => setForm(null)} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16 }}>
      {dogs.map((dog) => (
        <Card key={dog.id} onPress={() => edit(dog)}>
          <Text style={text.title}>{dog.name}</Text>
          <Text style={text.muted}>{[dog.breed, dog.good_with_other_dogs ? 'Good with dogs' : 'Prefers solo walks'].filter(Boolean).join(' · ')}</Text>
        </Card>
      ))}
      {dogs.length === 0 && <SectionTitle>No dogs added yet</SectionTitle>}
      <Button title="Add a dog" onPress={() => edit()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
});
