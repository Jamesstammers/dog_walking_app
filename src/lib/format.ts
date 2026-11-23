const TZ = 'Europe/London';

export function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

export function formatDay(date: Date): string {
  return date.toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDateTime(iso: string): string {
  return `${formatDay(new Date(iso))}, ${formatTime(iso)}`;
}

/** YYYY-MM-DD for a date as seen in London. */
export function londonDateKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: TZ });
}

/** The next `count` days starting today, London time. */
export function upcomingDays(count: number): Date[] {
  const days: Date[] = [];
  const start = new Date();
  for (let i = 0; i < count; i++) {
    days.push(new Date(start.getTime() + i * 24 * 60 * 60 * 1000));
  }
  return days;
}

export const statusLabels: Record<string, string> = {
  requested: 'Waiting for approval',
  approved: 'Confirmed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  completed: 'Completed',
};
