import { Image, ImageBackground, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from './ui';

/** Screen header painted with the logo's brushstrokes, with the business name in large type. */
export function BrandHeader({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  return (
    <ImageBackground
      source={require('../../assets/brand/brush-band.png')}
      resizeMode="cover"
      style={[styles.band, { paddingTop: insets.top + 10 }]}
    >
      <View style={styles.card}>
        <Image source={require('../../assets/brand/logo.png')} style={styles.logo} accessibilityIgnoresInvertColors />
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.brand} numberOfLines={1} accessibilityRole="header">Portsmouth Paws</Text>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  band: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.pink,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: 'rgba(251, 246, 242, 0.9)',
    borderRadius: 30,
    paddingLeft: 4,
    paddingRight: 18,
    paddingVertical: 4,
  },
  logo: { width: 50, height: 50, borderRadius: 25 },
  brand: { fontFamily: fonts.display, fontSize: 28, lineHeight: 30, color: colors.text },
  title: { fontFamily: fonts.medium, fontSize: 14, color: colors.primary },
});
