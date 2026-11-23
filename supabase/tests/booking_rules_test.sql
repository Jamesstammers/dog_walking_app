-- Run: psql -v ON_ERROR_STOP=1 -f stub_supabase.sql -f ../migrations/*.sql -f booking_rules_test.sql
\pset tuples_only on
\pset format unaligned
\set QUIET on
create or replace function assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FAIL: %', msg; end if; raise notice 'ok: %', msg; end $$;

-- Times: next Monday 10:00 London.
create temp table t as select
  ((date_trunc('week', now() at time zone 'Europe/London') + interval '7 days 10 hours') at time zone 'Europe/London') as mon10;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'), -- owner
  ('00000000-0000-0000-0000-000000000002'), -- customer A
  ('00000000-0000-0000-0000-000000000003'); -- customer B (not approved)
update profiles set role = 'owner', approved = true where id = '00000000-0000-0000-0000-000000000001';
update profiles set approved = true where id = '00000000-0000-0000-0000-000000000002';

insert into dogs (id, owner_id, name) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Rex'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Bella'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'Max');

create temp table svc as select kind, duration_min, id from services;
grant all on t, svc to public;

-- Customer A books a group walk at 10:00 with two dogs.
set test.uid = '00000000-0000-0000-0000-000000000002';
select assert(request_booking(
  (select id from svc where kind='group_walk' and duration_min=60), (select mon10 from t),
  array['10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002']::uuid[], 'card') is not null,
  'approved customer can request a group walk');

select assert(slot_available((select id from svc where kind='group_walk' and duration_min=60), (select mon10 from t), 2),
  'group walk still has room for 2 more dogs');
select assert(not slot_available((select id from svc where kind='group_walk' and duration_min=60), (select mon10 from t), 3),
  'group walk cap of 4 enforced');
select assert(not slot_available((select id from svc where kind='solo_walk' and duration_min=30), (select mon10 from t) + interval '30 min', 1),
  'solo walk cannot overlap a group walk');
select assert(slot_available((select id from svc where kind='solo_walk' and duration_min=30), (select mon10 from t) + interval '60 min', 1),
  'solo walk allowed straight after');
select assert(not slot_available((select id from svc where kind='sit_in' and duration_min=30), (select mon10 from t) - interval '3 hours', 1),
  'nothing before working hours (07:00)');
select assert(not slot_available((select id from svc where kind='sit_in' and duration_min=60), (select mon10 from t) + interval '7 hours 30 min', 1),
  'nothing running past 18:00');
select assert(not slot_available((select id from svc where kind='sit_in' and duration_min=30), (select mon10 from t) - interval '2 days', 1),
  'no Saturday by default');
select assert((select count(*) from available_slots((select id from svc where kind='solo_walk' and duration_min=60), ((select mon10 from t) at time zone 'Europe/London')::date)) = 16,
  'solo 1h: 19 starts 08:00-17:00 minus 09:30, 10:00, 10:30 blocked by the group walk');

-- Unapproved customer B cannot book.
set test.uid = '00000000-0000-0000-0000-000000000003';
do $$ begin
  perform request_booking((select id from svc where kind='solo_walk' and duration_min=30), (select mon10 from t) + interval '2 hours',
    array['10000000-0000-0000-0000-000000000003']::uuid[], 'card');
  raise exception 'FAIL: unapproved customer booked';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: unapproved customer blocked (%)', sqlerrm;
end $$;

-- Customer B cannot approve themselves.
set test.uid = '00000000-0000-0000-0000-000000000003';
update profiles set approved = true, role = 'owner' where id = '00000000-0000-0000-0000-000000000003';
select assert((select not approved and role = 'customer' from profiles where id='00000000-0000-0000-0000-000000000003'),
  'customer cannot self-approve or become owner');

-- Declined bookings free the slot.
update bookings set status = 'declined';
select assert(slot_available((select id from svc where kind='solo_walk' and duration_min=30), (select mon10 from t) + interval '30 min', 1),
  'declined booking frees the slot');

-- Time off blocks the day.
insert into time_off (starts_at, ends_at) select mon10 - interval '10 hours', mon10 + interval '14 hours' from t;
select assert(not slot_available((select id from svc where kind='solo_walk' and duration_min=30), (select mon10 from t), 1),
  'time off blocks bookings');
\echo ALL TESTS PASSED
