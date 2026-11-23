import { router } from 'expo-router';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, colors, Field, fonts, text } from '../components/ui';
import { demoSignIn } from '../lib/demo';
import { isDemo, supabase } from '../lib/supabase';

export default function SignIn() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    const result =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
    setBusy(false);
    if (result.error) {
      setMessage(result.error.message);
    } else if (!result.data.session) {
      setMessage('Check your email to confirm your account, then sign in.');
    } else {
      router.replace('/');
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Image source={require('../../assets/brand/logo.png')} style={styles.logo} accessibilityLabel="Portsmouth Paws" />
          {isDemo && (
            <View style={styles.demo}>
              <Text style={text.title}>Demo version</Text>
              <Text style={[text.muted, { marginBottom: 8 }]}>
                Sample customers, dogs and bookings. Nothing is saved, and no payments are taken.
              </Text>
              <Button title="Try it as a customer" onPress={() => { demoSignIn('customer'); router.replace('/'); }} />
              <Button variant="secondary" title="Try it as the business owner" onPress={() => { demoSignIn('owner'); router.replace('/'); }} />
            </View>
          )}
          <Text style={styles.heading}>{mode === 'sign-in' ? 'Welcome back' : 'Create an account'}</Text>
          <Text style={[text.muted, { marginBottom: 24 }]}>Book walks and sit-ins with Portsmouth Paws.</Text>
          {mode === 'sign-up' && <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" />}
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
          {message && <Text style={[text.error, { marginBottom: 8 }]}>{message}</Text>}
          <Button title={mode === 'sign-in' ? 'Sign in' : 'Create account'} onPress={submit} loading={busy} disabled={!email || !password} />
          <Button
            variant="secondary"
            title={mode === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
            onPress={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, paddingTop: 24, maxWidth: 480, width: '100%', alignSelf: 'center' },
  logo: { width: 160, height: 160, alignSelf: 'center', marginBottom: 20 },
  demo: { backgroundColor: colors.primaryLight, borderRadius: 12, padding: 16, marginBottom: 28 },
  heading: { fontSize: 34, fontFamily: fonts.display, color: colors.text, marginBottom: 2 },
});
