import { Redirect, Tabs } from 'expo-router';
import { tabIcon, tabLabel, tabScreenOptions } from '../../components/tabs';
import { useAuth } from '../../lib/auth';

export default function CustomerLayout() {
  const { session, loading } = useAuth();
  if (!loading && !session) return <Redirect href="/sign-in" />;
  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen name="index" options={{ title: 'My bookings', tabBarLabel: tabLabel('My bookings'), tabBarIcon: tabIcon('calendar-outline') }} />
      <Tabs.Screen name="book" options={{ title: 'Book', tabBarLabel: tabLabel('Book'), tabBarIcon: tabIcon('add-circle-outline') }} />
      <Tabs.Screen name="updates" options={{ title: 'Walk updates', tabBarLabel: tabLabel('Updates'), tabBarIcon: tabIcon('images-outline') }} />
      <Tabs.Screen name="dogs" options={{ title: 'My dogs', tabBarLabel: tabLabel('My dogs'), tabBarIcon: tabIcon('paw-outline') }} />
      <Tabs.Screen name="contact" options={{ title: 'Contact us', tabBarLabel: tabLabel('Contact'), tabBarIcon: tabIcon('chatbubble-ellipses-outline') }} />
    </Tabs>
  );
}
