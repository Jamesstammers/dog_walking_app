import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, View } from 'react-native';
import { colors } from './ui';

const tints = [colors.pink, colors.primary, colors.accent, colors.blue];

/** The dog's photo, or a paw on a brand colour when there's no photo yet. */
export function DogAvatar({ uri, size = 44, index = 0 }: { uri?: string | null; size?: number; index?: number }) {
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={[round, { backgroundColor: colors.primaryLight }]} />;
  return (
    <View style={[round, { backgroundColor: tints[index % tints.length], alignItems: 'center', justifyContent: 'center' }]}>
      <Ionicons name="paw" size={size * 0.5} color="#fff" />
    </View>
  );
}
