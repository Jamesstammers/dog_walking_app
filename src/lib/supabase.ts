import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { demoClient } from './demo';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Demo mode runs on sample data with no backend. On when no Supabase URL is set, or EXPO_PUBLIC_DEMO=1. */
export const isDemo = process.env.EXPO_PUBLIC_DEMO === '1' || !url;

export const supabase: SupabaseClient = isDemo
  ? (demoClient as unknown as SupabaseClient)
  : createClient(url, anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
