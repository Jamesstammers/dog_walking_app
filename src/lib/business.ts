import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { supabase } from './supabase';
import type { BusinessInfo } from './types';

export function useBusinessInfo() {
  const [info, setInfo] = useState<BusinessInfo | null>(null);
  const reload = useCallback(async () => {
    const { data } = await supabase.from('business_info').select('*').eq('id', 1).single();
    setInfo((data as BusinessInfo) ?? null);
  }, []);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  return { info, reload };
}

/** UK mobile like "07700 900000" -> "447700900000" for wa.me links. */
export function whatsappNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.startsWith('0') ? `44${digits.slice(1)}` : digits;
}
