-- Dog walking app: initial schema
-- Times are stored as timestamptz; the business runs in Europe/London.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create type user_role as enum ('customer', 'owner');

create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  role          user_role not null default 'customer',
  full_name     text not null default '',
  phone         text,
  address       text,
  postcode      text,
  -- New customers need a meet and greet before they can book.
  approved      boolean not null default false,
  -- Owner can allow "pay later by invoice" per customer.
  invoice_allowed boolean not null default true,
  stripe_customer_id text,
  created_at    timestamptz not null default now()
);

create table dogs (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references profiles on delete cascade,
  name          text not null,
  breed         text,
  date_of_birth date,
  vet_details   text,
  vaccinations_up_to_date boolean not null default false,
  good_with_other_dogs boolean not null default true,
  notes         text,
  photo_url     text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Services (owner sets prices and group caps in the admin screen)
-- ---------------------------------------------------------------------------
create type service_kind as enum ('solo_walk', 'group_walk', 'sit_in');

create table services (
  id            uuid primary key default gen_random_uuid(),
  kind          service_kind not null,
  duration_min  int not null check (duration_min in (30, 60)),
  name          text not null,
  price_pence   int not null default 0 check (price_pence >= 0),
  -- Max dogs per booking slot. Group walks share a slot across customers.
  max_dogs      int not null default 1 check (max_dogs >= 1),
  -- A solo walk is always one dog; group walks and sit-ins can take several.
  constraint solo_walk_one_dog check (kind <> 'solo_walk' or max_dogs = 1),
  active        boolean not null default true,
  unique (kind, duration_min)
);

insert into services (kind, duration_min, name, max_dogs) values
  ('solo_walk',  30, 'Solo walk (30 min)',  1),
  ('solo_walk',  60, 'Solo walk (1 hour)',  1),
  ('group_walk', 30, 'Group walk (30 min)', 4),
  ('group_walk', 60, 'Group walk (1 hour)', 4),
  ('sit_in',     30, 'Sit-in (30 min)',     3),
  ('sit_in',     60, 'Sit-in (1 hour)',     3);

-- ---------------------------------------------------------------------------
-- Availability
-- ---------------------------------------------------------------------------
-- Weekly working hours (0 = Sunday ... 6 = Saturday), local London time.
create table working_hours (
  id            uuid primary key default gen_random_uuid(),
  weekday       int not null check (weekday between 0 and 6),
  start_time    time not null,
  end_time      time not null check (end_time > start_time)
);

insert into working_hours (weekday, start_time, end_time)
select d, '08:00', '18:00' from generate_series(1, 5) d;

-- Holidays and one-off blocked periods.
create table time_off (
  id            uuid primary key default gen_random_uuid(),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null check (ends_at > starts_at),
  reason        text
);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create type booking_status as enum ('requested', 'approved', 'declined', 'cancelled', 'completed');
create type payment_method as enum ('card', 'invoice');
create type payment_status as enum ('unpaid', 'card_saved', 'paid', 'invoiced', 'refunded', 'failed');
-- Customers pick a part of the day, not an exact time; exact times go in the notes.
create type time_window as enum ('morning', 'afternoon', 'evening', 'any');

create table bookings (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references profiles on delete restrict,
  service_id     uuid not null references services,
  booking_date   date not null,          -- London calendar day
  time_window    time_window not null,
  status         booking_status not null default 'requested',
  payment_method payment_method not null,
  payment_status payment_status not null default 'unpaid',
  price_pence    int not null,
  stripe_payment_intent_id text,
  stripe_invoice_id        text,
  customer_notes text,
  owner_notes    text,
  -- Bookings requested together (a block booking) share a batch id.
  batch_id       uuid,
  created_at     timestamptz not null default now(),
  decided_at     timestamptz
);

create index bookings_date_idx on bookings (booking_date);
create index bookings_customer_idx on bookings (customer_id);
create index bookings_batch_idx on bookings (batch_id);

create table booking_dogs (
  booking_id    uuid not null references bookings on delete cascade,
  dog_id        uuid not null references dogs on delete restrict,
  primary key (booking_id, dog_id)
);

-- ---------------------------------------------------------------------------
-- Business details and settings
-- ---------------------------------------------------------------------------
-- Contact details shown on the customer Contact page. One row, edited in Settings.
create table business_info (
  id          int primary key default 1 check (id = 1),
  name        text not null default 'Portsmouth Paws',
  about       text not null default '',
  phone       text,
  email       text,
  whatsapp    text,
  instagram   text,
  facebook    text,
  service_area text,
  hours_note  text,
  -- Most walks she'll take in one part of the day (morning, afternoon or evening).
  -- Group walks of the same type in the same part of the day count as one walk.
  max_walks_per_slot int not null default 3 check (max_walks_per_slot between 1 and 20)
);
insert into business_info (id) values (1);

alter table business_info enable row level security;
create policy "anyone reads contact details" on business_info for select using (true);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'owner');
$$;

create policy "owner edits contact details" on business_info for update using (is_owner()) with check (is_owner());

-- Today's date in London.
create or replace function london_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/London')::date $$;

-- Days customers can book: working weekdays, not today or earlier, not during time off.
create or replace function day_bookable(p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select p_date > london_today()
    and p_date <= london_today() + 120
    and exists (select 1 from working_hours w where w.weekday = extract(dow from p_date))
    and not exists (
      select 1 from time_off t
      where t.starts_at < ((p_date + 1)::timestamp at time zone 'Europe/London')
        and t.ends_at   > (p_date::timestamp at time zone 'Europe/London')
    );
$$;

-- Days in a range that can't be booked because of time off (for greying out the calendar).
create or replace function blocked_dates(p_from date, p_to date) returns setof date
language sql stable security definer set search_path = public as $$
  select d::date from generate_series(p_from, p_to, interval '1 day') d
  where exists (
    select 1 from time_off t
    where t.starts_at < ((d::date + 1)::timestamp at time zone 'Europe/London')
      and t.ends_at   > (d::date::timestamp at time zone 'Europe/London')
  );
$$;

-- Walks already taken in one part of a day. Requested and approved bookings count;
-- group walks of the same service share one outing.
create or replace function walks_in_slot(p_date date, p_window time_window) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from (
    select case when s.kind = 'group_walk' then s.id::text else b.id::text end
    from bookings b join services s on s.id = b.service_id
    where b.booking_date = p_date and b.time_window = p_window
      and b.status in ('requested', 'approved')
    group by 1
  ) x;
$$;

-- Whether a part of a day can take another booking. "any" needs room somewhere in the day.
create or replace function slot_free(p_date date, p_window time_window) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  cap int := (select max_walks_per_slot from business_info where id = 1);
begin
  if not day_bookable(p_date) then return false; end if;
  if p_window <> 'any' then return walks_in_slot(p_date, p_window) < cap; end if;
  -- No preference: room somewhere in the day, and the day as a whole isn't full.
  return (select count(*) from bookings b where b.booking_date = p_date and b.status in ('requested', 'approved')) < 3 * cap
    and (walks_in_slot(p_date, 'morning') < cap or walks_in_slot(p_date, 'afternoon') < cap or walks_in_slot(p_date, 'evening') < cap);
end;
$$;

-- Free or full for each part of each day in a range. Shows no booking details.
create or replace function day_availability(p_from date, p_to date)
returns table (day date, bookable boolean, morning boolean, afternoon boolean, evening boolean)
language sql stable security definer set search_path = public as $$
  select d::date, day_bookable(d::date),
         slot_free(d::date, 'morning'), slot_free(d::date, 'afternoon'), slot_free(d::date, 'evening')
  from generate_series(p_from, p_to, interval '1 day') d;
$$;

-- Customers create bookings through this function so the rules always apply.
create or replace function request_booking(
  p_service_id uuid, p_date date, p_time_window time_window, p_dog_ids uuid[],
  p_payment_method payment_method, p_notes text default null,
  p_batch_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  svc services;
  new_id uuid;
begin
  select * into me from profiles where id = auth.uid();
  if not found then raise exception 'Not signed in'; end if;
  if not me.approved then raise exception 'Your account is waiting for a meet and greet'; end if;
  if p_payment_method = 'invoice' and not me.invoice_allowed then
    raise exception 'Pay by invoice is not enabled for this account';
  end if;
  if coalesce(array_length(p_dog_ids, 1), 0) = 0 then raise exception 'Choose at least one dog'; end if;
  if exists (select 1 from unnest(p_dog_ids) d
             where d not in (select id from dogs where owner_id = me.id)) then
    raise exception 'Unknown dog';
  end if;

  select * into svc from services where id = p_service_id and active;
  if not found then raise exception 'That service is not available'; end if;
  if array_length(p_dog_ids, 1) > svc.max_dogs then
    raise exception '%', case when svc.max_dogs = 1 then 'A solo walk is for one dog. Book a group walk for more.'
                             else format('Up to %s dogs per booking for this service', svc.max_dogs) end;
  end if;
  if not day_bookable(p_date) then raise exception '% is not available to book', to_char(p_date, 'Dy DD Mon'); end if;

  -- One request at a time, so two customers can't take the last place together.
  perform pg_advisory_xact_lock(hashtext('bookings'));
  -- Joining a group walk that's already running in that part of the day doesn't need a new place.
  if not slot_free(p_date, p_time_window) and not (
    svc.kind = 'group_walk' and p_time_window <> 'any' and exists (
      select 1 from bookings b where b.service_id = svc.id and b.booking_date = p_date
        and b.time_window = p_time_window and b.status in ('requested', 'approved'))
  ) then
    raise exception '% is fully booked on %', initcap(p_time_window::text), to_char(p_date, 'Dy DD Mon');
  end if;

  -- The same dog can't be booked twice for the same service, day and part of the day.
  if exists (
    select 1 from bookings b join booking_dogs bd on bd.booking_id = b.id
    where b.status in ('requested', 'approved') and b.service_id = svc.id
      and b.booking_date = p_date and b.time_window = p_time_window
      and bd.dog_id = any (p_dog_ids)
  ) then
    raise exception 'Already booked on %', to_char(p_date, 'Dy DD Mon');
  end if;

  insert into bookings (customer_id, service_id, booking_date, time_window, payment_method, price_pence, customer_notes, batch_id)
  values (me.id, svc.id, p_date, p_time_window, p_payment_method, -- Group walks are priced per dog; solo walks and sit-ins per visit.
    case when svc.kind = 'group_walk' then svc.price_pence * array_length(p_dog_ids, 1) else svc.price_pence end, p_notes, p_batch_id)
  returning id into new_id;

  insert into booking_dogs (booking_id, dog_id) select new_id, unnest(p_dog_ids);
  return new_id;
end;
$$;

-- Customers can cancel their own bookings up to the day before.
create or replace function cancel_booking(p_booking_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update bookings set status = 'cancelled'
  where id = p_booking_id and customer_id = auth.uid()
    and status in ('requested', 'approved') and booking_date > london_today();
  if not found then raise exception 'Booking cannot be cancelled'; end if;
end;
$$;

-- New sign-ups get a customer profile.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table profiles      enable row level security;
alter table dogs          enable row level security;
alter table services      enable row level security;
alter table working_hours enable row level security;
alter table time_off      enable row level security;
alter table bookings      enable row level security;
alter table booking_dogs  enable row level security;

create policy "own profile or owner" on profiles for select using (id = auth.uid() or is_owner());
create policy "update own profile" on profiles for update using (id = auth.uid())
  with check (id = auth.uid());
create policy "owner updates profiles" on profiles for update using (is_owner());

-- Stop customers promoting themselves or approving their own account.
create or replace function protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the dashboard and server code (service role).
  if auth.uid() is not null and not is_owner() then
    new.role := old.role;
    new.approved := old.approved;
    new.invoice_allowed := old.invoice_allowed;
    new.stripe_customer_id := old.stripe_customer_id;
  end if;
  return new;
end;
$$;
create trigger protect_profile before update on profiles
for each row execute function protect_profile_fields();

create policy "own dogs" on dogs for all using (owner_id = auth.uid() or is_owner())
  with check (owner_id = auth.uid() or is_owner());

create policy "anyone reads services" on services for select using (true);
create policy "owner manages services" on services for all using (is_owner()) with check (is_owner());

create policy "anyone reads hours" on working_hours for select using (true);
create policy "owner manages hours" on working_hours for all using (is_owner()) with check (is_owner());

create policy "owner manages time off" on time_off for all using (is_owner()) with check (is_owner());

-- Customers read their own bookings; they create them via request_booking().
create policy "read own bookings" on bookings for select using (customer_id = auth.uid() or is_owner());
create policy "owner manages bookings" on bookings for update using (is_owner()) with check (is_owner());

create policy "read own booking dogs" on booking_dogs for select using (
  is_owner() or exists (select 1 from bookings b where b.id = booking_id and b.customer_id = auth.uid())
);
