import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { PostCard } from '../../components/PostCard';
import { colors, text } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import type { Post } from '../../lib/types';

/** Photos and notes from walks, for this customer's dogs only. */
export default function Updates() {
  const { session } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    const { data: myDogs } = await supabase.from('dogs').select('id').eq('owner_id', session.user.id);
    const dogIds = ((myDogs as { id: string }[]) ?? []).map((d) => d.id);
    const { data: tags } = await supabase.from('post_dogs').select('post_id').in('dog_id', dogIds);
    const postIds = [...new Set(((tags as { post_id: string }[]) ?? []).map((t) => t.post_id))];
    const { data } = await supabase
      .from('posts')
      .select('*, post_dogs(dog_id, dogs(name, photo_url))')
      .in('id', postIds)
      .order('created_at', { ascending: false })
      .limit(50);
    setPosts((data as Post[]) ?? []);
    setRefreshing(false);
  }, [session]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16 }}
      data={posts}
      keyExtractor={(p) => p.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
      ListEmptyComponent={
        <View style={{ alignItems: 'center', marginTop: 48, gap: 8 }}>
          <Ionicons name="images-outline" size={40} color={colors.pink} />
          <Text style={text.title}>No updates yet</Text>
          <Text style={[text.muted, { textAlign: 'center' }]}>Photos and news from your dog's walks will appear here.</Text>
        </View>
      }
      renderItem={({ item }) => <PostCard post={item} />}
    />
  );
}
