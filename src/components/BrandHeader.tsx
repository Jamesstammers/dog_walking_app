import { Image, ImageBackground, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from './ui';

/** Screen header painted with the logo's brushstrokes, carrying the brand onto every screen. */
export function BrandHeader({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  return (
    <ImageBackground
      source={require('../../assets/brand/brush-band.png')}
      resizeMode="cover"
      style={[styles.band, { paddingTop: insets.top + 12 }]}
    >
      <View style={styles.titlePill}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>
      <Image source={require('../../assets/brand/logo.png')} style={styles.logo} accessibilityLabel="Portsmouth Paws" />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.pink,
  },
  titlePill: {
    backgroundColor: 'rgba(251, 246, 242, 0.88)',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 4,
    flexShrink: 1,
  },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.text },
  logo: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: '#fff', marginLeft: 12 },
});
