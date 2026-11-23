import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Switch, Text, View } from 'react-native';
import { Card, colors, text } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import type { Dog, Profile } from '../../lib/types';

type Customer = Profile & { dogs: Pick<Dog, 'name'>[] };

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*, dogs(name)')
      .eq('role', 'customer')
      .order('approved')
      .order('full_name');
    setCustomers((data as Customer[]) ?? []);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function update(id: string, patch: Partial<Profile>) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', id);
    if (error) Alert.alert('Could not update', error.message);
    load();
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16 }}
      data={customers}
      keyExtractor={(c) => c.id}
      ListEmptyComponent={<Text style={[text.muted, { textAlign: 'center', marginTop: 40 }]}>No customers yet.</Text>}
      renderItem={({ item }) => (
        <Card>
          <Text style={text.title}>{item.full_name || 'No name yet'}</Text>
          <Text style={text.muted}>{[item.phone, item.postcode].filter(Boolean).join(' · ')}</Text>
          <Text style={text.muted}>Dogs: {item.dogs.map((d) => d.name).join(', ') || 'none added'}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <Text style={text.body}>Meet and greet done, can book</Text>
            <Switch value={item.approved} onValueChange={(approved) => update(item.id, { approved })} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={text.body}>Can pay by invoice</Text>
            <Switch value={item.invoice_allowed} onValueChange={(invoice_allowed) => update(item.id, { invoice_allowed })} />
          </View>
        </Card>
      )}
    />
  );
}
