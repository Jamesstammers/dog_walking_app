import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from './ui';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Date keys are YYYY-MM-DD (London calendar days). */
export function addDays(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(key: string): number {
  return new Date(`${key}T12:00:00Z`).getUTCDay(); // 0 = Sunday
}

type Props = {
  today: string;
  maxDate: string;
  selected: string[];
  /** Dates that are part of the booking through a weekly repeat (shown lighter). */
  repeated?: string[];
  isDisabled: (key: string) => boolean;
  onToggle: (key: string) => void;
};

export function Calendar({ today, maxDate, selected, repeated = [], isDisabled, onToggle }: Props) {
  const [month, setMonth] = useState(today.slice(0, 7)); // YYYY-MM

  const cells = useMemo(() => {
    const first = `${month}-01`;
    const offset = (weekdayOf(first) + 6) % 7; // Monday first
    const out: (string | null)[] = Array(offset).fill(null);
    for (let key = first; key.startsWith(month); key = addDays(key, 1)) out.push(key);
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);

  const label = new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shift = (n: number) => {
    const d = new Date(`${month}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  const canBack = month > today.slice(0, 7);
  const canForward = month < maxDate.slice(0, 7);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Pressable accessibilityLabel="Previous month" onPress={() => shift(-1)} disabled={!canBack} style={[styles.nav, !canBack && styles.faded]}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </Pressable>
        <Text style={styles.month}>{label}</Text>
        <Pressable accessibilityLabel="Next month" onPress={() => shift(1)} disabled={!canForward} style={[styles.nav, !canForward && styles.faded]}>
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={styles.weekday}>{d}</Text>
        ))}
        {cells.map((key, i) => {
          if (!key) return <View key={`blank-${i}`} style={styles.cell} />;
          const disabled = key < today || key > maxDate || isDisabled(key);
          const isSelected = selected.includes(key);
          const isRepeat = !isSelected && repeated.includes(key);
          return (
            <View key={key} style={styles.cell}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled }}
                accessibilityLabel={key}
                disabled={disabled}
                onPress={() => onToggle(key)}
                style={[styles.day, isSelected && styles.daySelected, isRepeat && styles.dayRepeat, key === today && !isSelected && styles.today]}
              >
                <Text style={[styles.dayText, disabled && styles.dayTextDisabled, isSelected && styles.dayTextSelected]}>
                  {parseInt(key.slice(8), 10)}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  nav: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  faded: { opacity: 0.3 },
  month: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontFamily: fonts.medium, fontSize: 12, color: colors.muted, paddingBottom: 6 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  day: { flex: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: colors.primary },
  dayRepeat: { backgroundColor: colors.pink },
  today: { borderWidth: 1.5, borderColor: colors.accent },
  dayText: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  dayTextDisabled: { color: '#C4B9C1' },
  dayTextSelected: { color: '#fff' },
});
