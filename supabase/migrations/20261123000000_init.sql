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
  active        boolean not null default true,
  unique (kind, duration_min)
);

insert into services (kind, duration_min, name, max_dogs) values
  ('solo_walk',  30, 'Solo walk (30 min)',  2),
  ('solo_walk',  60, 'Solo walk (1 hour)',  2),
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

create table bookings (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references profiles on delete restrict,
  service_id     uuid not null references services,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null check (ends_at > starts_at),
  status         booking_status not null default 'requested',
  payment_method payment_method not null,
  payment_status payment_status not null default 'unpaid',
  price_pence    int not null,
  stripe_payment_intent_id text,
  stripe_invoice_id        text,
  customer_notes text,
  owner_notes    text,
  created_at     timestamptz not null default now(),
  decided_at     timestamptz
);

create index bookings_time_idx on bookings using gist (tstzrange(starts_at, ends_at));
create index bookings_customer_idx on bookings (customer_id);

create table booking_dogs (
  booking_id    uuid not null references bookings on delete cascade,
  dog_id        uuid not null references dogs on delete restrict,
  primary key (booking_id, dog_id)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'owner');
$$;

-- Bookings that hold time on the calendar.
create or replace function holds_time(s booking_status) returns boolean
language sql immutable as $$ select s in ('requested', 'approved') $$;

-- Is a slot free for this service? Rules:
--  * Nothing may overlap time off.
--  * Must fall inside working hours.
--  * Solo walks and sit-ins need the walker to themselves.
--  * Group walks can share a slot with other group walks of the same
--    service and start time, up to services.max_dogs dogs in total.
create or replace function slot_available(
  p_service_id uuid, p_starts_at timestamptz, p_dog_count int,
  p_ignore_booking uuid default null
) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  svc        services;
  p_ends_at  timestamptz;
  local_start timestamp;
  local_end   timestamp;
  dogs_in_group int;
begin
  select * into svc from services where id = p_service_id and active;
  if not found then return false; end if;
  if p_dog_count < 1 or p_dog_count > svc.max_dogs then return false; end if;

  p_ends_at   := p_starts_at + make_interval(mins => svc.duration_min);
  local_start := p_starts_at at time zone 'Europe/London';
  local_end   := p_ends_at   at time zone 'Europe/London';

  if p_starts_at < now() then return false; end if;

  if not exists (
    select 1 from working_hours w
    where w.weekday = extract(dow from local_start)
      and local_start::time >= w.start_time
      and local_end::time   <= w.end_time
      and local_start::date  = local_end::date
  ) then return false; end if;

  if exists (
    select 1 from time_off t
    where tstzrange(t.starts_at, t.ends_at) && tstzrange(p_starts_at, p_ends_at)
  ) then return false; end if;

  -- Any overlapping booking that is not a matching group walk blocks the slot.
  if exists (
    select 1 from bookings b
    where holds_time(b.status)
      and b.id is distinct from p_ignore_booking
      and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_starts_at, p_ends_at)
      and not (svc.kind = 'group_walk' and b.service_id = svc.id and b.starts_at = p_starts_at)
  ) then return false; end if;

  if svc.kind = 'group_walk' then
    select count(*) into dogs_in_group
    from bookings b join booking_dogs bd on bd.booking_id = b.id
    where holds_time(b.status)
      and b.id is distinct from p_ignore_booking
      and b.service_id = svc.id and b.starts_at = p_starts_at;
    if dogs_in_group + p_dog_count > svc.max_dogs then return false; end if;
  end if;

  return true;
end;
$$;

-- Free start times for a service on a given local date, in 30 min steps.
-- Customers see this on the calendar; it reveals no customer details.
create or replace function available_slots(p_service_id uuid, p_date date, p_dog_count int default 1)
returns table (starts_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s
  from generate_series(
         (p_date::timestamp) at time zone 'Europe/London',
         ((p_date + 1)::timestamp) at time zone 'Europe/London' - interval '30 minutes',
         interval '30 minutes') s
  where slot_available(p_service_id, s, p_dog_count);
$$;

-- Customers create bookings through this function so the rules always apply.
create or replace function request_booking(
  p_service_id uuid, p_starts_at timestamptz, p_dog_ids uuid[],
  p_payment_method payment_method, p_notes text default null
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
  if exists (select 1 from unnest(p_dog_ids) d
             where d not in (select id from dogs where owner_id = me.id)) then
    raise exception 'Unknown dog';
  end if;

  -- Serialise booking requests so two people can't take the last place at once.
  perform pg_advisory_xact_lock(hashtext('bookings'));

  if not slot_available(p_service_id, p_starts_at, coalesce(array_length(p_dog_ids, 1), 0)) then
    raise exception 'That time is no longer available';
  end if;

  select * into svc from services where id = p_service_id;

  insert into bookings (customer_id, service_id, starts_at, ends_at, payment_method, price_pence, customer_notes)
  values (me.id, svc.id, p_starts_at, p_starts_at + make_interval(mins => svc.duration_min),
          p_payment_method, svc.price_pence, p_notes)
  returning id into new_id;

  insert into booking_dogs (booking_id, dog_id) select new_id, unnest(p_dog_ids);
  return new_id;
end;
$$;

-- Customers can cancel their own upcoming bookings.
create or replace function cancel_booking(p_booking_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update bookings set status = 'cancelled'
  where id = p_booking_id and customer_id = auth.uid()
    and status in ('requested', 'approved') and starts_at > now();
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
