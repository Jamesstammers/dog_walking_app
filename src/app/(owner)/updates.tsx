import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DogAvatar } from '../../components/DogAvatar';
import { PostCard } from '../../components/PostCard';
import { Button, Card, colors, Field, fonts, SectionTitle, text } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { notify } from '../../lib/dialog';
import { londonDateKey } from '../../lib/format';
import { pickWalkPhoto, uploadWalkPhoto } from '../../lib/photos';
import { supabase } from '../../lib/supabase';
import type { Dog, Post } from '../../lib/types';

type DogWithOwner = Dog & { profiles?: { full_name: string } };

/** Post a photo and a note from a walk. Only the owners of the tagged dogs see it. */
export default function OwnerUpdates() {
  const { session } = useAuth();
  const [dogs, setDogs] = useState<DogWithOwner[]>([]);
  const [todaysDogIds, setTodaysDogIds] = useState<string[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [tagged, setTagged] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    const [{ data: d }, { data: p }, { data: b }] = await Promise.all([
      supabase.from('dogs').select('*').order('name'),
      supabase.from('posts').select('*, post_dogs(dog_id, dogs(name, photo_url))').order('created_at', { ascending: false }).limit(30),
      supabase.from('bookings').select('starts_at, booking_dogs(dog_id)').eq('status', 'approved')
        .gte('starts_at', new Date(Date.now() - 18 * 3600_000).toISOString())
        .lt('starts_at', new Date(Date.now() + 18 * 3600_000).toISOString()),
    ]);
    setDogs((d as DogWithOwner[]) ?? []);
    setPosts((p as Post[]) ?? []);
    const today = londonDateKey(new Date());
    const ids = ((b as { starts_at: string; booking_dogs: { dog_id: string }[] }[]) ?? [])
      .filter((x) => londonDateKey(new Date(x.starts_at)) === today)
      .flatMap((x) => (x.booking_dogs ?? []).map((bd) => bd.dog_id));
    setTodaysDogIds([...new Set(ids)]);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const todaysDogs = useMemo(() => dogs.filter((d) => todaysDogIds.includes(d.id)), [dogs, todaysDogIds]);
  const listed = showAll || todaysDogs.length === 0 ? dogs : todaysDogs;

  async function choosePhoto() {
    try {
      const uri = await pickWalkPhoto();
      if (uri) setPhoto(uri);
    } catch (e) {
      notify('Could not open your photos', e instanceof Error ? e.message : undefined);
    }
  }

  async function post() {
    if (!session || tagged.length === 0) return;
    setPosting(true);
    try {
      const photo_url = photo ? await uploadWalkPhoto(photo) : null;
      const { data, error } = await supabase.from('posts')
        .insert({ author_id: session.user.id, caption: caption.trim(), photo_url })
        .select().single();
      if (error || !data) throw error ?? new Error('No post created');
      const { error: tagError } = await supabase.from('post_dogs').insert(tagged.map((dog_id) => ({ post_id: (data as Post).id, dog_id })));
      if (tagError) throw tagError;
      notify('Posted', 'Their owners can see it now.');
      setPhoto(null);
      setCaption('');
      setTagged([]);
      load();
    } catch (e) {
      notify('Could not post', (e as { message?: string })?.message);
    } finally {
      setPosting(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Card>
        <Text style={styles.heading}>Share a walk update</Text>
        <Pressable accessibilityRole="button" onPress={choosePhoto} style={styles.photoBox}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
          ) : (
            <View style={styles.photoEmpty}>
              <Ionicons name="camera" size={30} color={colors.primary} />
              <Text style={styles.photoText}>Add a photo</Text>
            </View>
          )}
        </Pressable>
        <Field label="What did they get up to?" value={caption} onChangeText={setCaption} multiline placeholder="Lovely run on Southsea Common…" />
        <Text style={styles.label}>{todaysDogs.length && !showAll ? "Today's dogs" : 'Who is in it?'}</Text>
        <View style={styles.dogGrid}>
          {listed.map((dog, i) => {
            const on = tagged.includes(dog.id);
            return (
              <Pressable key={dog.id} onPress={() => setTagged((t) => (on ? t.filter((x) => x !== dog.id) : [...t, dog.id]))}
                style={[styles.dogChip, on && styles.dogChipOn]}>
                <DogAvatar uri={dog.photo_url} size={30} index={i} />
                <Text style={[styles.dogName, on && { color: '#fff' }]}>{dog.name}</Text>
              </Pressable>
            );
          })}
        </View>
        {todaysDogs.length > 0 && (
          <Pressable onPress={() => setShowAll(!showAll)}>
            <Text style={styles.link}>{showAll ? "Show just today's dogs" : 'Show all dogs'}</Text>
          </Pressable>
        )}
        <Button title="Post update" onPress={post} loading={posting} disabled={tagged.length === 0 || (!photo && !caption.trim())} />
        <Text style={[text.muted, { textAlign: 'center' }]}>Only the owners of the dogs you pick will see it.</Text>
      </Card>

      <SectionTitle>Recent updates</SectionTitle>
      {posts.length === 0 && <Text style={text.muted}>Nothing posted yet.</Text>}
      {posts.map((p) => <PostCard key={p.id} post={p} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heading: { fontFamily: fonts.display, fontSize: 24, color: colors.text, marginBottom: 10 },
  photoBox: { marginBottom: 12, borderRadius: 14, overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 4 / 3 },
  photoEmpty: {
    height: 140, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14,
    borderWidth: 2, borderStyle: 'dashed', borderColor: colors.pink, backgroundColor: colors.primaryLight,
  },
  photoText: { fontFamily: fonts.bold, fontSize: 15, color: colors.primary },
  label: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted, marginBottom: 6 },
  dogGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  dogChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4, paddingRight: 12, paddingVertical: 4,
    borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  dogChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dogName: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  link: { fontFamily: fonts.medium, fontSize: 14, color: colors.primary, marginBottom: 6 },
});
