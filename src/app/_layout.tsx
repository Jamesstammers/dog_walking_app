import { Fredoka_400Regular, Fredoka_500Medium, Fredoka_600SemiBold } from '@expo-google-fonts/fredoka';
import { PatrickHandSC_400Regular } from '@expo-google-fonts/patrick-hand-sc';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { colors } from '../components/ui';
import { AuthProvider } from '../lib/auth';
import { NotificationBanner } from '../lib/dialog';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Fredoka_400Regular, Fredoka_500Medium, Fredoka_600SemiBold, PatrickHandSC_400Regular });
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
      <NotificationBanner />
    </AuthProvider>
  );
}
