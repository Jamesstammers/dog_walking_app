import { Redirect, Tabs } from 'expo-router';
import { colors } from '../../components/ui';
import { useAuth } from '../../lib/auth';

export default function CustomerLayout() {
  const { session, loading } = useAuth();
  if (!loading && !session) return <Redirect href="/sign-in" />;
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary, headerTitleStyle: { fontWeight: '600' } }}>
      <Tabs.Screen name="index" options={{ title: 'My bookings' }} />
      <Tabs.Screen name="book" options={{ title: 'Book' }} />
      <Tabs.Screen name="dogs" options={{ title: 'My dogs' }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
    </Tabs>
  );
}
