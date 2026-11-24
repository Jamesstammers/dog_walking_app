-- Run: psql -v ON_ERROR_STOP=1 -f stub_supabase.sql -f ../migrations/*.sql -f booking_rules_test.sql
\pset tuples_only on
\pset format unaligned
\set QUIET on
create or replace function assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FAIL: %', msg; end if; raise notice 'ok: %', msg; end $$;

-- Dates: next Monday (London) and the Saturday before it.
create temp table t as select
  (date_trunc('week', now() at time zone 'Europe/London') + interval '7 days')::date as mon;

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
update services set price_pence = 1500 where kind = 'group_walk' and duration_min = 60;

create or replace function expect_error(q text, msg text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'FAIL: % (no error)', msg;
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok: % (%)', msg, sqlerrm;
end $$;

set test.uid = '00000000-0000-0000-0000-000000000002';
select assert(request_booking(
  (select id from svc where kind='group_walk' and duration_min=60), (select mon from t), 'morning',
  array['10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002']::uuid[], 'card') is not null,
  'approved customer can request a morning group walk');
select assert((select b.price_pence from bookings b join services s on s.id = b.service_id
  where s.kind='group_walk' and s.duration_min=60 and b.time_window='morning' and b.booking_date=(select mon from t))
  = 2 * (select price_pence from services where kind='group_walk' and duration_min=60), 'group walk price is per dog (2 dogs = double)');
select expect_error($q$ select request_booking((select id from svc where kind='solo_walk' and duration_min=30), (select mon + 1 from t), 'morning',
  array['10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002']::uuid[], 'card') $q$, 'solo walk takes one dog only');
select expect_error($q$ update services set max_dogs = 2 where kind = 'solo_walk' $q$, 'solo walk cannot be set above one dog');
select assert((select time_window from bookings limit 1) = 'morning', 'booking stores the part of the day');

select expect_error($q$ select request_booking((select id from svc where kind='group_walk' and duration_min=60), (select mon from t), 'morning',
  array['10000000-0000-0000-0000-000000000001']::uuid[], 'card') $q$, 'same dog, day and part of day is rejected');
select assert(request_booking((select id from svc where kind='group_walk' and duration_min=60), (select mon from t), 'evening',
  array['10000000-0000-0000-0000-000000000001']::uuid[], 'card') is not null, 'same dog can have an evening walk too');
select expect_error($q$ select request_booking((select id from svc where kind='solo_walk' and duration_min=30), (select mon from t) - 2, 'any',
  array['10000000-0000-0000-0000-000000000001']::uuid[], 'card') $q$, 'no Saturday by default');
select expect_error($q$ select request_booking((select id from svc where kind='solo_walk' and duration_min=30), london_today(), 'any',
  array['10000000-0000-0000-0000-000000000001']::uuid[], 'card') $q$, 'nothing for today or earlier');
select expect_error($q$ select request_booking((select id from svc where kind='solo_walk' and duration_min=30), (select mon from t) + 1, 'any',
  array['10000000-0000-0000-0000-000000000003']::uuid[], 'card') $q$, 'cannot book someone else''s dog');

-- Block booking: three weekly walks share a batch id.
select request_booking((select id from svc where kind='solo_walk' and duration_min=30), (select mon from t) + 7*w + 1, 'afternoon',
  array['10000000-0000-0000-0000-000000000001']::uuid[], 'invoice', 'Around 2pm please', '20000000-0000-0000-0000-000000000001')
from generate_series(0, 2) w;
select assert((select count(*) from bookings where batch_id = '20000000-0000-0000-0000-000000000001') = 3,
  'block booking creates three linked bookings');

-- Unapproved customer B cannot book.
set test.uid = '00000000-0000-0000-0000-000000000003';
select expect_error($q$ select request_booking((select id from svc where kind='solo_walk' and duration_min=30), (select mon from t) + 1, 'any',
  array['10000000-0000-0000-0000-000000000003']::uuid[], 'card') $q$, 'unapproved customer blocked');

-- Customer B cannot approve themselves.
update profiles set approved = true, role = 'owner' where id = '00000000-0000-0000-0000-000000000003';
select assert((select not approved and role = 'customer' from profiles where id='00000000-0000-0000-0000-000000000003'),
  'customer cannot self-approve or become owner');

-- Cancelling frees the day; time off blocks it.
set test.uid = '00000000-0000-0000-0000-000000000002';
select cancel_booking(id) from bookings where time_window = 'morning';
select assert(request_booking((select id from svc where kind='group_walk' and duration_min=60), (select mon from t), 'morning',
  array['10000000-0000-0000-0000-000000000001']::uuid[], 'card') is not null, 'cancelled booking can be rebooked');
insert into time_off (starts_at, ends_at)
select ((mon + 2)::timestamp at time zone 'Europe/London'), ((mon + 3)::timestamp at time zone 'Europe/London') from t;
select assert((select array_agg(d) from blocked_dates((select mon from t), (select mon + 6 from t)) d) = array[(select mon + 2 from t)],
  'time off shows as a blocked date');
select expect_error($q$ select request_booking((select id from svc where kind='solo_walk' and duration_min=30), (select mon from t) + 2, 'any',
  array['10000000-0000-0000-0000-000000000001']::uuid[], 'card') $q$, 'time off blocks bookings');

-- Availability: with a limit of 2 walks per part of the day, the third solo walk is refused,
-- but joining a group walk already running that morning is fine.
set test.uid = '';
update business_info set max_walks_per_slot = 2;
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000004');
update profiles set approved = true where id = '00000000-0000-0000-0000-000000000004';
insert into dogs (id, owner_id, name) values ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', 'Dot');
set test.uid = '00000000-0000-0000-0000-000000000004';
select request_booking((select id from svc where kind='solo_walk' and duration_min=30), (select mon + 3 from t), 'morning',
  array['10000000-0000-0000-0000-000000000004']::uuid[], 'card');
select request_booking((select id from svc where kind='sit_in' and duration_min=30), (select mon + 3 from t), 'morning',
  array['10000000-0000-0000-0000-000000000004']::uuid[], 'card');
select assert((select not morning and afternoon from day_availability((select mon + 3 from t), (select mon + 3 from t))),
  'morning shows full after 2 walks, afternoon still free');
select expect_error($q$ select request_booking((select id from svc where kind='solo_walk' and duration_min=60), (select mon + 3 from t), 'morning',
  array['10000000-0000-0000-0000-000000000004']::uuid[], 'card') $q$, 'full part of the day refuses another walk');
set test.uid = '00000000-0000-0000-0000-000000000002';
select request_booking((select id from svc where kind='group_walk' and duration_min=60), (select mon + 3 from t), 'afternoon',
  array['10000000-0000-0000-0000-000000000001']::uuid[], 'card');
select request_booking((select id from svc where kind='solo_walk' and duration_min=60), (select mon + 3 from t), 'afternoon',
  array['10000000-0000-0000-0000-000000000001']::uuid[], 'card');
set test.uid = '00000000-0000-0000-0000-000000000004';
select assert(request_booking((select id from svc where kind='group_walk' and duration_min=60), (select mon + 3 from t), 'afternoon',
  array['10000000-0000-0000-0000-000000000004']::uuid[], 'card') is not null, 'joining an existing group walk still works when the slot is full');
select assert((select not bookable and not morning from day_availability((select mon + 2 from t), (select mon + 2 from t))),
  'time off day shows as not bookable');
\echo BOOKING TESTS PASSED

-- Walk updates: customers only see posts that tag their own dogs.
set test.uid = '';
insert into dogs (id, owner_id, name) values ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000003', 'Pip');
insert into posts (id, author_id, caption) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Rex at the beach'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Pip in the park');
insert into post_dogs values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000009');
create role app_user;
grant usage on schema public, auth to app_user;
grant select on all tables in schema public to app_user;
grant execute on all functions in schema public, auth to app_user;
set role app_user;
set test.uid = '00000000-0000-0000-0000-000000000002';
select assert((select array_agg(caption) from posts) = array['Rex at the beach'], 'customer A sees only posts about their dogs');
set test.uid = '00000000-0000-0000-0000-000000000001';
select assert((select count(*) from posts) = 2, 'owner sees every post');
select assert((select name from business_info) = 'Portsmouth Paws', 'anyone can read contact details');
reset role;
\echo ALL TESTS PASSED (including walk updates)
