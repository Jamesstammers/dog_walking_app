import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, Field, fonts, SectionTitle, text } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useBusinessInfo, whatsappNumber } from '../../lib/business';
import { notify } from '../../lib/dialog';
import { supabase } from '../../lib/supabase';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function ContactRow({ icon, tint, label, value, url }: { icon: IconName; tint: string; label: string; value: string; url: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url).catch(() => notify(label, value))} style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={20} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={text.muted}>{label}</Text>
        <Text style={styles.rowValue} selectable>{value}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

export default function Contact() {
  const { profile, refreshProfile } = useAuth();
  const { info } = useBusinessInfo();
  const [form, setForm] = useState({ full_name: '', phone: '', address: '', postcode: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) setForm({ full_name: profile.full_name, phone: profile.phone ?? '', address: profile.address ?? '', postcode: profile.postcode ?? '' });
  }, [profile]);

  async function save() {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update(form).eq('id', profile.id);
    setSaving(false);
    if (error) notify('Could not save', error.message);
    else {
      await refreshProfile();
      notify('Your details are saved');
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.hero}>
        <Image source={require('../../../assets/brand/logo.png')} style={styles.logo} />
        <Text style={styles.name}>{info?.name ?? 'Portsmouth Paws'}</Text>
        {info?.about ? <Text style={[text.muted, { textAlign: 'center' }]}>{info.about}</Text> : null}
      </View>

      {info && (
        <Card>
          {info.phone && <ContactRow icon="call" tint={colors.primary} label="Call" value={info.phone} url={`tel:${info.phone.replace(/\s/g, '')}`} />}
          {info.whatsapp && <ContactRow icon="logo-whatsapp" tint="#25A35A" label="WhatsApp" value={info.whatsapp} url={`https://wa.me/${whatsappNumber(info.whatsapp)}`} />}
          {info.email && <ContactRow icon="mail" tint={colors.accent} label="Email" value={info.email} url={`mailto:${info.email}`} />}
          {info.instagram && <ContactRow icon="logo-instagram" tint={colors.pink} label="Instagram" value={`@${info.instagram.replace(/^@/, '')}`} url={`https://instagram.com/${info.instagram.replace(/^@/, '')}`} />}
          {info.facebook && <ContactRow icon="logo-facebook" tint={colors.blue} label="Facebook" value={info.facebook} url={`https://facebook.com/search/top?q=${encodeURIComponent(info.facebook)}`} />}
        </Card>
      )}

      {(info?.service_area || info?.hours_note) && (
        <Card>
          {info?.service_area ? (
            <View style={styles.infoLine}>
              <Ionicons name="location" size={18} color={colors.primary} />
              <Text style={[text.body, { flex: 1 }]}>Areas covered: {info.service_area}</Text>
            </View>
          ) : null}
          {info?.hours_note ? (
            <View style={styles.infoLine}>
              <Ionicons name="time" size={18} color={colors.primary} />
              <Text style={[text.body, { flex: 1 }]}>{info.hours_note}</Text>
            </View>
          ) : null}
        </Card>
      )}

      <SectionTitle>Your details</SectionTitle>
      <Field label="Name" value={form.full_name} onChangeText={(full_name) => setForm({ ...form, full_name })} />
      <Field label="Phone" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} keyboardType="phone-pad" />
      <Field label="Address" value={form.address} onChangeText={(address) => setForm({ ...form, address })} multiline />
      <Field label="Postcode" value={form.postcode} onChangeText={(postcode) => setForm({ ...form, postcode })} autoCapitalize="characters" />
      <Button title="Save my details" onPress={save} loading={saving} />
      <Button variant="secondary" title="Sign out" onPress={async () => { await supabase.auth.signOut(); router.replace('/sign-in'); }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 6, marginBottom: 16 },
  logo: { width: 110, height: 110, borderRadius: 55 },
  name: { fontFamily: fonts.display, fontSize: 34, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowValue: { fontFamily: fonts.medium, fontSize: 16, color: colors.text },
  infoLine: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 4 },
});
