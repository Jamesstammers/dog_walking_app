import { Image, StyleSheet, Text, View } from 'react-native';
import { timeAgo } from '../lib/format';
import type { Post } from '../lib/types';
import { DogAvatar } from './DogAvatar';
import { Card, colors, fonts, text } from './ui';

/** One walk update: who it's about, the photo, and the caption. */
export function PostCard({ post, children }: { post: Post; children?: React.ReactNode }) {
  const dogs = post.post_dogs ?? [];
  return (
    <Card>
      <View style={styles.top}>
        <View style={styles.avatars}>
          {dogs.slice(0, 3).map((pd, i) => (
            <View key={pd.dog_id} style={{ marginLeft: i ? -12 : 0, borderRadius: 20, borderWidth: 2, borderColor: '#fff' }}>
              <DogAvatar uri={pd.dogs.photo_url} size={36} index={i} />
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={text.title}>{dogs.map((pd) => pd.dogs.name).join(' & ') || 'Walk update'}</Text>
          <Text style={text.muted}>{timeAgo(post.created_at)}</Text>
        </View>
      </View>
      {post.photo_url ? <Image source={{ uri: post.photo_url }} style={styles.photo} resizeMode="cover" /> : null}
      {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatars: { flexDirection: 'row' },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 14, backgroundColor: colors.primaryLight, marginBottom: 10 },
  caption: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: colors.text },
});
