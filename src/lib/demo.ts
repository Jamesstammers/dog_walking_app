/**
 * Demo mode: an in-memory stand-in for the Supabase client with sample data,
 * so the app can be shown without a backend. Mirrors the booking rules in
 * supabase/migrations. Data resets when the app reloads.
 */
import { londonDateKey } from './format';

type Row = Record<string, any>;
type Listener = (event: string, session: any) => void;

const HOUR = 3600_000;
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export const DEMO_CUSTOMER_ID = 'demo-customer';
export const DEMO_OWNER_ID = 'demo-owner';

function londonParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { weekday, minutes: parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10) };
}

/** UTC instants for each 30 min start on a London calendar day. */
function halfHoursOn(day: string): Date[] {
  const out: Date[] = [];
  const base = new Date(`${day}T00:00:00Z`).getTime() - 2 * HOUR;
  for (let t = base; t < base + 28 * HOUR; t += HOUR / 2) {
    const d = new Date(t);
    if (londonDateKey(d) === day) out.push(d);
  }
  return out;
}

/** A London day `offset` days from today at hh:mm, as an ISO string. */
function at(offset: number, hhmm: string): string {
  const day = londonDateKey(new Date(Date.now() + offset * 24 * HOUR));
  const [h, m] = hhmm.split(':').map(Number);
  const match = halfHoursOn(day).find((d) => londonParts(d).minutes === h * 60 + m);
  return (match ?? new Date(`${day}T${hhmm}:00Z`)).toISOString();
}

/** Next working day (Mon to Fri) at least `min` days ahead. */
function workday(min: number): number {
  let i = min;
  while (true) {
    const wd = londonParts(new Date(Date.now() + i * 24 * HOUR)).weekday;
    if (wd >= 1 && wd <= 5) return i;
    i++;
  }
}

function seed() {
  const services = [
    { id: 's1', kind: 'solo_walk', duration_min: 30, name: 'Solo walk (30 min)', price_pence: 1200, max_dogs: 2, active: true },
    { id: 's2', kind: 'solo_walk', duration_min: 60, name: 'Solo walk (1 hour)', price_pence: 1800, max_dogs: 2, active: true },
    { id: 's3', kind: 'group_walk', duration_min: 30, name: 'Group walk (30 min)', price_pence: 1000, max_dogs: 4, active: true },
    { id: 's4', kind: 'group_walk', duration_min: 60, name: 'Group walk (1 hour)', price_pence: 1500, max_dogs: 4, active: true },
    { id: 's5', kind: 'sit_in', duration_min: 30, name: 'Sit-in (30 min)', price_pence: 1200, max_dogs: 3, active: true },
    { id: 's6', kind: 'sit_in', duration_min: 60, name: 'Sit-in (1 hour)', price_pence: 1800, max_dogs: 3, active: true },
  ];
  const profiles = [
    { id: DEMO_OWNER_ID, role: 'owner', full_name: 'Owner (demo)', phone: null, address: null, postcode: null, approved: true, invoice_allowed: true },
    { id: DEMO_CUSTOMER_ID, role: 'customer', full_name: 'Emma Clarke', phone: '07700 900123', address: '12 Orchard Lane', postcode: 'PO4 0AB', approved: true, invoice_allowed: true },
    { id: 'c2', role: 'customer', full_name: 'Tom Hughes', phone: '07700 900456', address: '4 Mill Road', postcode: 'PO5 2QT', approved: true, invoice_allowed: false },
    { id: 'c3', role: 'customer', full_name: 'Priya Shah', phone: '07700 900789', address: '31 Station Street', postcode: 'PO2 9LZ', approved: false, invoice_allowed: true },
  ];
  const dogs = [
    { id: 'd1', owner_id: DEMO_CUSTOMER_ID, name: 'Biscuit', breed: 'Cockapoo', vet_details: 'Southsea Vets, 023 9200 0000', vaccinations_up_to_date: true, good_with_other_dogs: true, notes: 'Pulls on the lead near squirrels' },
    { id: 'd2', owner_id: DEMO_CUSTOMER_ID, name: 'Luna', breed: 'Border Collie', vet_details: 'Southsea Vets', vaccinations_up_to_date: true, good_with_other_dogs: true, notes: null },
    { id: 'd3', owner_id: 'c2', name: 'Murphy', breed: 'Labrador', vet_details: null, vaccinations_up_to_date: true, good_with_other_dogs: true, notes: 'Loves water' },
    { id: 'd4', owner_id: 'c3', name: 'Pepper', breed: 'Jack Russell', vet_details: null, vaccinations_up_to_date: false, good_with_other_dogs: false, notes: null },
  ];
  const w1 = workday(1), w2 = workday(w1 + 1), w3 = workday(w2 + 1);
  const mk = (id: string, customer: string, svc: string, starts: string, status: string, method: string, dogIds: string[], notes: string | null = null) => {
    const s = services.find((x) => x.id === svc)!;
    return {
      booking: {
        id, customer_id: customer, service_id: svc, starts_at: starts,
        ends_at: new Date(new Date(starts).getTime() + s.duration_min * 60_000).toISOString(),
        status, payment_method: method, payment_status: status === 'approved' && method === 'card' ? 'paid' : 'unpaid',
        price_pence: s.price_pence, customer_notes: notes, owner_notes: null, created_at: new Date().toISOString(), decided_at: null,
      },
      dogs: dogIds,
    };
  };
  const seeded = [
    mk('b1', DEMO_CUSTOMER_ID, 's4', at(w1, '10:00'), 'approved', 'card', ['d1', 'd2']),
    mk('b2', 'c2', 's4', at(w1, '10:00'), 'approved', 'invoice', ['d3']),
    mk('b3', 'c2', 's2', at(w1, '14:00'), 'requested', 'card', ['d3'], 'Back gate code is 1234'),
    mk('b4', DEMO_CUSTOMER_ID, 's6', at(w2, '12:00'), 'requested', 'invoice', ['d1'], 'Please top up water bowl'),
    mk('b5', 'c2', 's1', at(w3, '09:00'), 'approved', 'card', ['d3']),
  ];
  return {
    services,
    profiles,
    dogs,
    working_hours: [1, 2, 3, 4, 5].map((weekday) => ({ id: `wh${weekday}`, weekday, start_time: '08:00:00', end_time: '18:00:00' })),
    time_off: [] as Row[],
    bookings: seeded.map((s) => s.booking) as Row[],
    booking_dogs: seeded.flatMap((s) => s.dogs.map((dog_id) => ({ booking_id: s.booking.id, dog_id }))),
  } as Record<string, Row[]>;
}

const db = seed();

// ---------------------------------------------------------------------------
// Booking rules (same as slot_available() in the SQL migration)
// ---------------------------------------------------------------------------
const holdsTime = (s: string) => s === 'requested' || s === 'approved';
const toMin = (t: string) => parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3, 5), 10);

function slotAvailable(serviceId: string, startsAt: Date, dogCount: number, ignore?: string): boolean {
  const svc = db.services.find((s) => s.id === serviceId && s.active);
  if (!svc || dogCount < 1 || dogCount > svc.max_dogs) return false;
  const start = startsAt.getTime();
  const end = start + svc.duration_min * 60_000;
  if (start < Date.now()) return false;
  const ls = londonParts(startsAt);
  const le = londonParts(new Date(end));
  const sameDay = londonDateKey(startsAt) === londonDateKey(new Date(end - 1));
  if (!sameDay || !db.working_hours.some((w) => w.weekday === ls.weekday && ls.minutes >= toMin(w.start_time) && (le.minutes || 1440) <= toMin(w.end_time))) return false;
  if (db.time_off.some((t) => new Date(t.starts_at).getTime() < end && new Date(t.ends_at).getTime() > start)) return false;
  const overlapping = db.bookings.filter((b) => holdsTime(b.status) && b.id !== ignore
    && new Date(b.starts_at).getTime() < end && new Date(b.ends_at).getTime() > start);
  const isSameGroup = (b: Row) => svc.kind === 'group_walk' && b.service_id === svc.id && new Date(b.starts_at).getTime() === start;
  if (overlapping.some((b) => !isSameGroup(b))) return false;
  if (svc.kind === 'group_walk') {
    const ids = new Set(overlapping.filter(isSameGroup).map((b) => b.id));
    const dogsInGroup = db.booking_dogs.filter((bd) => ids.has(bd.booking_id)).length;
    if (dogsInGroup + dogCount > svc.max_dogs) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Joins (enough for the selects the screens use)
// ---------------------------------------------------------------------------
function withJoins(table: string, row: Row): Row {
  if (table === 'bookings') {
    const svc = db.services.find((s) => s.id === row.service_id);
    const p = db.profiles.find((x) => x.id === row.customer_id);
    return {
      ...row,
      services: svc && { name: svc.name, kind: svc.kind },
      booking_dogs: db.booking_dogs.filter((bd) => bd.booking_id === row.id)
        .map((bd) => ({ dogs: { name: db.dogs.find((d) => d.id === bd.dog_id)?.name ?? '' } })),
      profiles: p && { full_name: p.full_name, phone: p.phone, address: p.address, postcode: p.postcode },
    };
  }
  if (table === 'profiles') {
    return { ...row, dogs: db.dogs.filter((d) => d.owner_id === row.id).map((d) => ({ name: d.name })) };
  }
  return { ...row };
}

const cmp = (a: any, b: any) => (a === b ? 0 : a === null || a === undefined ? 1 : b === null || b === undefined ? -1 : a < b ? -1 : 1);

class Query implements PromiseLike<{ data: any; error: any }> {
  private filters: ((r: Row) => boolean)[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private max?: number;
  private one = false;
  private op: 'select' | 'update' | 'insert' | 'delete' = 'select';
  private payload: any;

  constructor(private table: string) {}

  select(_cols?: string) { return this; }
  eq(col: string, v: any) { this.filters.push((r) => r[col] === v); return this; }
  in(col: string, vs: any[]) { this.filters.push((r) => vs.includes(r[col])); return this; }
  gte(col: string, v: any) { this.filters.push((r) => r[col] >= v); return this; }
  lt(col: string, v: any) { this.filters.push((r) => r[col] < v); return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.orders.push({ col, asc: opts?.ascending !== false }); return this; }
  limit(n: number) { this.max = n; return this; }
  single() { this.one = true; return this; }
  update(values: Row) { this.op = 'update'; this.payload = values; return this; }
  insert(values: Row | Row[]) { this.op = 'insert'; this.payload = values; return this; }
  delete() { this.op = 'delete'; return this; }

  private run(): { data: any; error: any } {
    const rows = db[this.table] ?? [];
    const match = (r: Row) => this.filters.every((f) => f(r));
    if (this.op === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      for (const v of list) rows.push({ id: uid(), ...v });
      return { data: null, error: null };
    }
    if (this.op === 'update') {
      rows.filter(match).forEach((r) => Object.assign(r, this.payload));
      return { data: null, error: null };
    }
    if (this.op === 'delete') {
      db[this.table] = rows.filter((r) => !match(r));
      return { data: null, error: null };
    }
    let out = rows.filter(match);
    for (const o of [...this.orders].reverse()) {
      out = [...out].sort((a, b) => (o.asc ? 1 : -1) * cmp(a[o.col], b[o.col]));
    }
    if (this.max !== undefined) out = out.slice(0, this.max);
    const joined = out.map((r) => withJoins(this.table, r));
    return this.one ? { data: joined[0] ?? null, error: joined[0] ? null : { message: 'Not found' } } : { data: joined, error: null };
  }

  then<A = { data: any; error: any }, B = never>(
    ok?: ((v: { data: any; error: any }) => A | PromiseLike<A>) | null,
    fail?: ((e: any) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(ok, fail);
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
let session: any = null;
const listeners = new Set<Listener>();
const emit = (event: string) => listeners.forEach((l) => l(event, session));

export function demoSignIn(role: 'customer' | 'owner') {
  const id = role === 'owner' ? DEMO_OWNER_ID : DEMO_CUSTOMER_ID;
  session = { access_token: 'demo', user: { id, email: `${role}@demo` } };
  emit('SIGNED_IN');
}

const demoOnly = async () => ({ data: { session: null, user: null }, error: { message: 'Demo mode: use the demo buttons below.' } });

export const demoClient = {
  from: (table: string) => new Query(table),
  rpc: async (fn: string, args: Row): Promise<{ data: any; error: any }> => {
    const me = db.profiles.find((p) => p.id === session?.user.id);
    if (fn === 'available_slots') {
      const data = halfHoursOn(args.p_date)
        .filter((d) => slotAvailable(args.p_service_id, d, args.p_dog_count ?? 1))
        .map((d) => ({ starts_at: d.toISOString() }));
      return { data, error: null };
    }
    if (fn === 'request_booking') {
      if (!me) return { data: null, error: { message: 'Not signed in' } };
      if (!me.approved) return { data: null, error: { message: 'Your account is waiting for a meet and greet' } };
      if (!slotAvailable(args.p_service_id, new Date(args.p_starts_at), args.p_dog_ids.length)) {
        return { data: null, error: { message: 'That time is no longer available' } };
      }
      const svc = db.services.find((s) => s.id === args.p_service_id)!;
      const id = uid();
      db.bookings.push({
        id, customer_id: me.id, service_id: svc.id, starts_at: new Date(args.p_starts_at).toISOString(),
        ends_at: new Date(new Date(args.p_starts_at).getTime() + svc.duration_min * 60_000).toISOString(),
        status: 'requested', payment_method: args.p_payment_method, payment_status: 'unpaid',
        price_pence: svc.price_pence, customer_notes: args.p_notes, owner_notes: null,
        created_at: new Date().toISOString(), decided_at: null,
      });
      for (const dog_id of args.p_dog_ids) db.booking_dogs.push({ booking_id: id, dog_id });
      return { data: id, error: null };
    }
    if (fn === 'cancel_booking') {
      const b = db.bookings.find((x) => x.id === args.p_booking_id && x.customer_id === me?.id);
      if (!b || !holdsTime(b.status)) return { data: null, error: { message: 'Booking cannot be cancelled' } };
      b.status = 'cancelled';
      return { data: null, error: null };
    }
    return { data: null, error: { message: `Unknown function ${fn}` } };
  },
  auth: {
    getSession: async () => ({ data: { session }, error: null }),
    onAuthStateChange: (cb: Listener) => {
      listeners.add(cb);
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    },
    signInWithPassword: demoOnly,
    signUp: demoOnly,
    signOut: async () => { session = null; emit('SIGNED_OUT'); return { error: null }; },
  },
};
