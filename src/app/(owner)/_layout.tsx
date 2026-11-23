import { Redirect, Tabs } from 'expo-router';
import { tabIcon, tabLabel, tabScreenOptions } from '../../components/tabs';
import { useAuth } from '../../lib/auth';

export default function OwnerLayout() {
  const { session, profile, loading } = useAuth();
  if (!loading && !session) return <Redirect href="/sign-in" />;
  if (!loading && profile && profile.role !== 'owner') return <Redirect href="/(customer)" />;
  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen name="index" options={{ title: 'Requests', tabBarLabel: tabLabel('Requests'), tabBarIcon: tabIcon('mail-unread-outline') }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule', tabBarLabel: tabLabel('Schedule'), tabBarIcon: tabIcon('calendar-outline') }} />
      <Tabs.Screen name="customers" options={{ title: 'Customers', tabBarLabel: tabLabel('Customers'), tabBarIcon: tabIcon('people-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarLabel: tabLabel('Settings'), tabBarIcon: tabIcon('settings-outline') }} />
    </Tabs>
  );
}
