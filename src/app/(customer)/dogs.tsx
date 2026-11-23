import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { DogAvatar } from '../../components/DogAvatar';
import { Button, Card, colors, Field, fonts, text } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { notify } from '../../lib/dialog';
import { pickDogPhoto, uploadDogPhoto } from '../../lib/photos';
import { supabase } from '../../lib/supabase';
import type { Dog } from '../../lib/types';

const emptyDog = {
  name: '', breed: '', vet_details: '', notes: '', vaccinations_up_to_date: false, good_with_other_dogs: true,
  photo_url: null as string | null,
};

export default function MyDogs() {
  const { session } = useAuth();
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [form, setForm] = useState<typeof emptyDog | null>(null);
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
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
    setNewPhoto(null);
    setForm(dog ? {
      name: dog.name, breed: dog.breed ?? '', vet_details: dog.vet_details ?? '', notes: dog.notes ?? '',
      vaccinations_up_to_date: dog.vaccinations_up_to_date, good_with_other_dogs: dog.good_with_other_dogs,
      photo_url: dog.photo_url,
    } : { ...emptyDog });
  }

  async function choosePhoto() {
    try {
      const uri = await pickDogPhoto();
      if (uri) setNewPhoto(uri);
    } catch (e) {
      notify('Could not open your photos', e instanceof Error ? e.message : undefined);
    }
  }

  async function save() {
    if (!form || !session) return;
    setSaving(true);
    try {
      const photo_url = newPhoto ? await uploadDogPhoto(session.user.id, newPhoto) : form.photo_url;
      const row = { ...form, photo_url, owner_id: session.user.id };
      const { error } = editingId
        ? await supabase.from('dogs').update(row).eq('id', editingId)
        : await supabase.from('dogs').insert(row);
      if (error) throw error;
      notify(`${form.name} saved`);
      setForm(null);
      load();
    } catch (e) {
      notify('Could not save', e instanceof Error ? e.message : String((e as { message?: string })?.message ?? ''));
    } finally {
      setSaving(false);
    }
  }

  if (form) {
    const set = (patch: Partial<typeof emptyDog>) => setForm({ ...form, ...patch });
    const shown = newPhoto ?? form.photo_url;
    return (
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose a photo" onPress={choosePhoto} style={styles.photoPicker}>
          <DogAvatar uri={shown} size={120} />
          <View style={styles.cameraBadge}>
            <Ionicons name="camera" size={18} color="#fff" />
          </View>
          <Text style={styles.photoLabel}>{shown ? 'Change photo' : 'Add a photo'}</Text>
        </Pressable>
        <Field label="Name" value={form.name} onChangeText={(name) => set({ name })} />
        <Field label="Breed" value={form.breed} onChangeText={(breed) => set({ breed })} />
        <Field label="Vet practice and phone" value={form.vet_details} onChangeText={(vet_details) => set({ vet_details })} />
        <Field label="Notes (allergies, recall, lead habits)" value={form.notes} onChangeText={(notes) => set({ notes })} multiline />
        <View style={styles.toggle}>
          <Text style={text.body}>Vaccinations up to date</Text>
          <Switch value={form.vaccinations_up_to_date} onValueChange={(v) => set({ vaccinations_up_to_date: v })} trackColor={{ true: colors.primary }} />
        </View>
        <View style={styles.toggle}>
          <Text style={text.body}>Good with other dogs</Text>
          <Switch value={form.good_with_other_dogs} onValueChange={(v) => set({ good_with_other_dogs: v })} trackColor={{ true: colors.primary }} />
        </View>
        <Button title="Save" onPress={save} loading={saving} disabled={!form.name.trim()} />
        <Button variant="secondary" title="Cancel" onPress={() => setForm(null)} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16 }}>
      {dogs.map((dog, i) => (
        <Card key={dog.id} onPress={() => edit(dog)}>
          <View style={styles.dogRow}>
            <DogAvatar uri={dog.photo_url} size={56} index={i} />
            <View style={{ flex: 1 }}>
              <Text style={text.title}>{dog.name}</Text>
              <Text style={text.muted}>{[dog.breed, dog.good_with_other_dogs ? 'Good with dogs' : 'Prefers solo walks'].filter(Boolean).join(' · ')}</Text>
              {!dog.photo_url && <Text style={styles.addPhotoHint}>Tap to add a photo</Text>}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </View>
        </Card>
      ))}
      {dogs.length === 0 && <Text style={[text.muted, { textAlign: 'center', marginVertical: 24 }]}>No dogs added yet.</Text>}
      <Button title="Add a dog" onPress={() => edit()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  dogRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  addPhotoHint: { fontFamily: fonts.medium, fontSize: 13, color: colors.primary, marginTop: 2 },
  photoPicker: { alignSelf: 'center', alignItems: 'center', marginBottom: 16 },
  cameraBadge: {
    position: 'absolute', top: 88, right: 0, width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff',
  },
  photoLabel: { fontFamily: fonts.medium, fontSize: 15, color: colors.primary, marginTop: 8 },
  toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
});
