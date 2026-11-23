import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../lib/auth';

export default function Index() {
  const { session, profile, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!session) return <Redirect href="/sign-in" />;
  if (profile?.role === 'owner') return <Redirect href="/(owner)" />;
  return <Redirect href="/(customer)" />;
}
