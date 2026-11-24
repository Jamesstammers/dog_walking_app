/**
 * Demo mode: an in-memory stand-in for the Supabase client with sample data,
 * so the app can be shown without a backend. Mirrors the booking rules in
 * supabase/migrations. Data resets when the app reloads.
 */
import { londonDateKey, walkStartsAt } from './format';

type Row = Record<string, any>;
type Listener = (event: string, session: any) => void;

const HOUR = 3600_000;
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export const DEMO_CUSTOMER_ID = 'demo-customer';
export const DEMO_OWNER_ID = 'demo-owner';

/** YYYY-MM-DD, `days` after a London date key. */
function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const weekdayOfKey = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay();
const today = () => londonDateKey(new Date());

/** The next working day (Mon to Fri) at least `min` days from today, as a date key. */
function workday(min: number): string {
  let key = addDaysKey(today(), min);
  while (weekdayOfKey(key) === 0 || weekdayOfKey(key) === 6) key = addDaysKey(key, 1);
  return key;
}

function seed() {
  const services = [
    { id: 's1', kind: 'solo_walk', duration_min: 30, name: 'Solo walk (30 min)', price_pence: 1200, max_dogs: 1, active: true },
    { id: 's2', kind: 'solo_walk', duration_min: 60, name: 'Solo walk (1 hour)', price_pence: 1800, max_dogs: 1, active: true },
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
  const w1 = workday(1), w2 = workday(2), w3 = workday(3);
  const mk = (id: string, customer: string, svc: string, date: string, window: string, status: string, method: string, dogIds: string[], notes: string | null = null, batch: string | null = null) => {
    const s = services.find((x) => x.id === svc)!;
    return {
      booking: {
        id, customer_id: customer, service_id: svc, booking_date: date, time_window: window,
        status, payment_method: method, payment_status: status === 'approved' && method === 'card' ? 'paid' : 'unpaid',
        price_pence: s.price_pence, customer_notes: notes, owner_notes: null, created_at: new Date().toISOString(), decided_at: null,
        batch_id: batch, cancel_requested_at: null as string | null,
      },
      dogs: dogIds,
    };
  };
  const seeded = [
    mk('b0', DEMO_CUSTOMER_ID, 's4', today(), 'morning', 'approved', 'card', ['d1', 'd2']),
    mk('b0b', 'c2', 's4', today(), 'morning', 'approved', 'invoice', ['d3']),
    mk('b1', DEMO_CUSTOMER_ID, 's4', w1, 'morning', 'approved', 'card', ['d1', 'd2']),
    mk('b2', 'c2', 's4', w1, 'morning', 'approved', 'invoice', ['d3']),
    // A block booking: the same walk on three weeks running, waiting for approval.
    mk('b3', 'c2', 's2', w1, 'afternoon', 'requested', 'card', ['d3'], 'Around 2pm if possible. Back gate code is 1234', 'batch-tom'),
    mk('b3b', 'c2', 's2', addDaysKey(w1, 7), 'afternoon', 'requested', 'card', ['d3'], 'Around 2pm if possible. Back gate code is 1234', 'batch-tom'),
    mk('b3c', 'c2', 's2', addDaysKey(w1, 14), 'afternoon', 'requested', 'card', ['d3'], 'Around 2pm if possible. Back gate code is 1234', 'batch-tom'),
    mk('b4', DEMO_CUSTOMER_ID, 's6', w2, 'any', 'requested', 'invoice', ['d1'], 'Please top up water bowl'),
    mk('b5', 'c2', 's1', w3, 'evening', 'approved', 'card', ['d3']),
    // Other customers' walks, so some parts of the day show as full (limit is 3 per part).
    mk('x1', 'c2', 's1', w1, 'morning', 'approved', 'card', ['d3']),
    mk('x2', 'c2', 's5', w1, 'morning', 'approved', 'card', ['d3']),
    mk('x3', 'c2', 's1', w2, 'afternoon', 'approved', 'card', ['d3']),
    mk('x4', 'c2', 's5', w2, 'afternoon', 'approved', 'card', ['d3']),
    mk('x5', 'c2', 's2', w2, 'afternoon', 'approved', 'card', ['d3']),
    mk('x6', 'c2', 's1', w3, 'morning', 'approved', 'card', ['d3']),
    mk('x7', 'c2', 's5', w3, 'morning', 'approved', 'card', ['d3']),
    mk('x8', 'c2', 's6', w3, 'morning', 'approved', 'card', ['d3']),
  ];
  const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();
  const posts = [
    { id: 'p1', author_id: DEMO_OWNER_ID, caption: 'Biscuit and Luna had a brilliant run on Southsea Common this morning. Both came back muddy and very happy!', photo_url: null, created_at: ago(2) },
    { id: 'p2', author_id: DEMO_OWNER_ID, caption: 'Murphy found the biggest stick on Eastney beach and refused to leave it behind.', photo_url: null, created_at: ago(5) },
    { id: 'p3', author_id: DEMO_OWNER_ID, caption: 'Quiet sit-in with Biscuit today. Fed, watered, and lots of fuss. Settled on the sofa when I left.', photo_url: null, created_at: ago(26) },
  ];
  const post_dogs = [
    { post_id: 'p1', dog_id: 'd1' }, { post_id: 'p1', dog_id: 'd2' },
    { post_id: 'p2', dog_id: 'd3' },
    { post_id: 'p3', dog_id: 'd1' },
  ];
  const business_info = [{
    id: 1,
    name: 'Portsmouth Paws',
    about: 'Friendly, reliable dog walking and pet sitting across Portsmouth. Fully insured and DBS checked. (Demo: these contact details are placeholders.)',
    phone: '07700 900000',
    email: 'hello@portsmouthpaws.example',
    whatsapp: '07700 900000',
    instagram: 'portsmouthpaws',
    facebook: 'Portsmouth Paws',
    service_area: 'Southsea, Fratton, Milton, Eastney and North End',
    hours_note: 'Walks Monday to Friday, 8am to 8pm. Messages answered within a few hours.',
    max_walks_per_slot: 3,
    cancel_notice_hours: 24,
  }];
  return {
    posts,
    post_dogs,
    business_info,
    services,
    profiles,
    dogs,
    working_hours: [1, 2, 3, 4, 5].map((weekday) => ({ id: `wh${weekday}`, weekday, start_time: '08:00:00', end_time: '18:00:00' })),
    time_off: [] as Row[],
    // Tom has asked to cancel tomorrow morning's walk, so the owner sees a cancellation request.
    bookings: seeded.map((s) => (s.booking.id === 'b2' ? { ...s.booking, cancel_requested_at: new Date(Date.now() - HOUR).toISOString() } : s.booking)) as Row[],
    booking_dogs: seeded.flatMap((s) => s.dogs.map((dog_id) => ({ booking_id: s.booking.id, dog_id }))),
  } as Record<string, Row[]>;
}

const db = seed();

// ---------------------------------------------------------------------------
// Booking rules (same as request_booking() in the SQL migration)
// ---------------------------------------------------------------------------
const holdsTime = (s: string) => s === 'requested' || s === 'approved';

function isBlocked(key: string): boolean {
  const start = new Date(`${key}T00:00:00Z`).getTime() - HOUR; // generous around BST
  const end = start + 26 * HOUR;
  return db.time_off.some((t) => new Date(t.starts_at).getTime() < end && new Date(t.ends_at).getTime() > start);
}

const cap = () => db.business_info[0]?.max_walks_per_slot ?? 3;

/** Walks taken in a part of a day; group walks of one service share an outing. */
function walksInSlot(key: string, window: string): number {
  const outings = new Set<string>();
  for (const b of db.bookings) {
    if (b.booking_date !== key || b.time_window !== window || !holdsTime(b.status)) continue;
    const svc = db.services.find((x) => x.id === b.service_id);
    outings.add(svc?.kind === 'group_walk' ? `g-${svc.id}` : b.id);
  }
  return outings.size;
}

function slotFree(key: string, window: string): boolean {
  if (!dayBookable(key)) return false;
  if (window !== 'any') return walksInSlot(key, window) < cap();
  const dayTotal = db.bookings.filter((b) => b.booking_date === key && holdsTime(b.status)).length;
  return dayTotal < 3 * cap() && ['morning', 'afternoon', 'evening'].some((w) => walksInSlot(key, w) < cap());
}

function dayBookable(key: string): boolean {
  return key > today() && key <= addDaysKey(today(), 120)
    && db.working_hours.some((w) => w.weekday === weekdayOfKey(key)) && !isBlocked(key);
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
        .map((bd) => ({ dog_id: bd.dog_id, dogs: { name: db.dogs.find((d) => d.id === bd.dog_id)?.name ?? '' } })),
      profiles: p && { full_name: p.full_name, phone: p.phone, address: p.address, postcode: p.postcode },
    };
  }
  if (table === 'posts') {
    return {
      ...row,
      post_dogs: db.post_dogs.filter((pd) => pd.post_id === row.id).map((pd) => {
        const dog = db.dogs.find((d) => d.id === pd.dog_id);
        return { dog_id: pd.dog_id, dogs: { name: dog?.name ?? '', photo_url: dog?.photo_url ?? null } };
      }),
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
  not(col: string, op: string, v: any) { if (op === 'is' && v === null) this.filters.push((r) => r[col] != null); return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.orders.push({ col, asc: opts?.ascending !== false }); return this; }
  limit(n: number) { this.max = n; return this; }
  single() { this.one = true; return this; }
  update(values: Row) { this.op = 'update'; this.payload = values; return this; }
  insert(values: Row | Row[]) { this.op = 'insert'; this.payload = values; return this; }
  // After insert, .select().single() returns the new row (used to get a post's id).
  delete() { this.op = 'delete'; return this; }

  private run(): { data: any; error: any } {
    const rows = db[this.table] ?? [];
    const match = (r: Row) => this.filters.every((f) => f(r));
    if (this.op === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const created = list.map((v: Row) => ({ id: uid(), created_at: new Date().toISOString(), ...v }));
      rows.push(...created);
      return { data: this.one ? created[0] : created, error: null };
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
    if (fn === 'blocked_dates') {
      const out: string[] = [];
      for (let k = args.p_from; k <= args.p_to; k = addDaysKey(k, 1)) if (isBlocked(k)) out.push(k);
      return { data: out, error: null };
    }
    if (fn === 'day_availability') {
      const out: Row[] = [];
      for (let k = args.p_from; k <= args.p_to; k = addDaysKey(k, 1)) {
        out.push({ day: k, bookable: dayBookable(k), morning: slotFree(k, 'morning'), afternoon: slotFree(k, 'afternoon'), evening: slotFree(k, 'evening') });
      }
      return { data: out, error: null };
    }
    if (fn === 'request_booking') {
      const fail = (message: string) => ({ data: null, error: { message } });
      if (!me) return fail('Not signed in');
      if (!me.approved) return fail('Your account is waiting for a meet and greet');
      const svc = db.services.find((s) => s.id === args.p_service_id && s.active);
      if (!svc) return fail('That service is not available');
      if (!args.p_dog_ids?.length) return fail('Choose at least one dog');
      if (args.p_dog_ids.length > svc.max_dogs) return fail(svc.max_dogs === 1 ? 'A solo walk is for one dog. Book a group walk for more.' : `Up to ${svc.max_dogs} dogs per booking for this service`);
      if (!dayBookable(args.p_date)) return fail(`${args.p_date} is not available to book`);
      const joiningGroup = svc.kind === 'group_walk' && args.p_time_window !== 'any' && db.bookings.some((b) =>
        holdsTime(b.status) && b.service_id === svc.id && b.booking_date === args.p_date && b.time_window === args.p_time_window);
      if (!slotFree(args.p_date, args.p_time_window) && !joiningGroup) return fail(`${args.p_time_window} is fully booked on ${args.p_date}`);
      const clash = db.bookings.some((b) => holdsTime(b.status) && b.service_id === svc.id && b.booking_date === args.p_date
        && b.time_window === args.p_time_window
        && db.booking_dogs.some((bd) => bd.booking_id === b.id && args.p_dog_ids.includes(bd.dog_id)));
      if (clash) return fail(`Already booked on ${args.p_date}`);
      const id = uid();
      db.bookings.push({
        id, customer_id: me.id, service_id: svc.id, booking_date: args.p_date, time_window: args.p_time_window,
        status: 'requested', payment_method: args.p_payment_method, payment_status: 'unpaid',
        price_pence: svc.kind === 'group_walk' ? svc.price_pence * args.p_dog_ids.length : svc.price_pence, customer_notes: args.p_notes, owner_notes: null,
        created_at: new Date().toISOString(), decided_at: null, batch_id: args.p_batch_id ?? null, cancel_requested_at: null,
      });
      for (const dog_id of args.p_dog_ids) db.booking_dogs.push({ booking_id: id, dog_id });
      return { data: id, error: null };
    }
    if (fn === 'cancel_booking') {
      // Mirrors cancel_booking() in SQL: close to the walk, an approved booking becomes a request she decides on.
      const b = db.bookings.find((x) => x.id === args.p_booking_id && x.customer_id === me?.id);
      const starts = b ? walkStartsAt(b.booking_date, b.time_window).getTime() : 0;
      if (!b || !holdsTime(b.status) || starts <= Date.now()) return { data: null, error: { message: 'Booking cannot be cancelled' } };
      if (b.cancel_requested_at) return { data: null, error: { message: 'You have already asked to cancel this booking' } };
      const notice = (db.business_info[0]?.cancel_notice_hours ?? 24) * HOUR;
      if (b.status === 'requested' || starts > Date.now() + notice) {
        b.status = 'cancelled';
        return { data: 'cancelled', error: null };
      }
      b.cancel_requested_at = new Date().toISOString();
      return { data: 'requested', error: null };
    }
    if (fn === 'decide_cancellation') {
      if (me?.role !== 'owner') return { data: null, error: { message: 'Only the owner can do this' } };
      const b = db.bookings.find((x) => x.id === args.p_booking_id && x.cancel_requested_at && x.status === 'approved');
      if (!b) return { data: null, error: { message: 'No cancellation request for that booking' } };
      if (args.p_approve) b.status = 'cancelled';
      b.cancel_requested_at = null;
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
