import { useEffect, useSyncExternalStore } from 'react';
import { londonDateKey } from './format';
import { supabase } from './supabase';

/*
 * How many things are waiting for the owner: new booking requests (a block booking counts once)
 * plus cancellation requests. Shown as a badge on the Requests tab.
 * TODO(push): also send a push notification when a new request or cancellation request arrives.
 */
let count = 0;
const listeners = new Set<() => void>();

export async function refreshOwnerAlerts() {
  const today = londonDateKey(new Date());
  const [{ data: reqs }, { data: cancels }] = await Promise.all([
    supabase.from('bookings').select('id, batch_id').eq('status', 'requested').gte('booking_date', today),
    supabase.from('bookings').select('id').eq('status', 'approved').not('cancel_requested_at', 'is', null),
  ]);
  const groups = new Set(((reqs as { id: string; batch_id: string | null }[]) ?? []).map((b) => b.batch_id ?? b.id));
  const next = groups.size + ((cancels as unknown[]) ?? []).length;
  if (next !== count) {
    count = next;
    listeners.forEach((l) => l());
  }
}

export function useOwnerAlerts(pollMs = 30_000) {
  useEffect(() => {
    refreshOwnerAlerts();
    const t = setInterval(refreshOwnerAlerts, pollMs);
    return () => clearInterval(t);
  }, [pollMs]);
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => count,
    () => count,
  );
}
