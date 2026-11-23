import { Text, View } from 'react-native';
import { text } from '../../components/ui';

// Owner screens (requests, calendar, customers, prices) are built next.
export default function OwnerHome() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={text.title}>Owner dashboard coming soon</Text>
    </View>
  );
}
