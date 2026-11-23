import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text } from 'react-native';

// Alert.alert does nothing on web, so web shows a banner instead.
type Note = { title: string; message?: string };
let show: ((n: Note | null) => void) | null = null;

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') show?.({ title, message });
  else Alert.alert(title, message);
}

export function confirmAction(title: string, message: string, actionLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Back', style: 'cancel' },
    { text: actionLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

export function NotificationBanner() {
  const [note, setNote] = useState<Note | null>(null);
  useEffect(() => {
    show = setNote;
    return () => { show = null; };
  }, []);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 3500);
    return () => clearTimeout(t);
  }, [note]);
  if (!note) return null;
  return (
    <Pressable style={styles.banner} onPress={() => setNote(null)}>
      <Text style={styles.title}>{note.title}</Text>
      {note.message ? <Text style={styles.message}>{note.message}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute', top: 16, left: 16, right: 16, zIndex: 1000, padding: 14, borderRadius: 12,
    backgroundColor: '#7B3FB0', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  title: { color: '#fff', fontSize: 16, fontFamily: 'Fredoka_600SemiBold' },
  message: { color: '#F3E8FA', fontSize: 14, marginTop: 2, fontFamily: 'Fredoka_400Regular' },
});
