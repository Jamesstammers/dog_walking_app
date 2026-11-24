import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

// Portsmouth Paws palette, taken from the logo's brushstrokes.
export const colors = {
  primary: '#7B3FB0', // purple
  primaryLight: '#F3E8FA',
  accent: '#F26A1B', // orange
  pink: '#F49AC8',
  blue: '#8DA2C4',
  text: '#1A1A1A',
  muted: '#6B6470',
  border: '#EADFE6',
  background: '#FBF6F2', // cream
  card: '#FFFFFF',
  danger: '#C0362C',
  free: '#2E9D5B', // availability: free
  full: '#D9CED6', // availability: full
};

export const fonts = {
  regular: 'Fredoka_400Regular',
  medium: 'Fredoka_500Medium',
  bold: 'Fredoka_600SemiBold',
  display: 'PatrickHandSC_400Regular', // hand-lettered, like the logo
};

export function Button({
  title, onPress, variant = 'primary', disabled, loading,
}: {
  title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; loading?: boolean;
}) {
  const style = [styles.button, variant !== 'primary' && styles.buttonSecondary, (disabled || loading) && styles.disabled];
  const textColor = variant === 'primary' ? '#fff' : variant === 'danger' ? colors.danger : colors.primary;
  return (
    <Pressable accessibilityRole="button" style={style} onPress={onPress} disabled={disabled || loading}>
      {loading ? <ActivityIndicator color={textColor} /> : <Text style={[styles.buttonText, { color: textColor }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} />
    </View>
  );
}

export function Card({ children, selected, onPress }: { children: ReactNode; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.card, selected && styles.cardSelected]}>
      {children}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, disabled }: { label: string; selected?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.chip, selected && styles.chipSelected, disabled && { opacity: 0.4 }]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected, disabled && { textDecorationLine: 'line-through' }]}>{label}</Text>
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export const text = StyleSheet.create({
  title: { fontSize: 17, fontFamily: fonts.bold, color: colors.text },
  body: { fontSize: 15, fontFamily: fonts.regular, color: colors.text },
  muted: { fontSize: 14, fontFamily: fonts.regular, color: colors.muted },
  error: { fontSize: 14, fontFamily: fonts.regular, color: colors.danger },
});

const styles = StyleSheet.create({
  button: { backgroundColor: colors.primary, borderRadius: 24, paddingVertical: 14, alignItems: 'center', marginVertical: 6 },
  buttonSecondary: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.primary },
  buttonText: { fontSize: 17, fontFamily: fonts.bold },
  disabled: { opacity: 0.5 },
  field: { marginBottom: 12 },
  label: { fontSize: 14, fontFamily: fonts.medium, color: colors.muted, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, fontSize: 16, fontFamily: fonts.regular, backgroundColor: colors.card, color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  cardSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginRight: 8, marginBottom: 8 },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 15, fontFamily: fonts.medium, color: colors.text },
  chipTextSelected: { color: '#fff' },
  sectionTitle: { fontSize: 20, fontFamily: fonts.display, color: colors.primary, marginTop: 18, marginBottom: 8 },
});
