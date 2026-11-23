# Dog walking app

Booking app for a UK dog walking business. Expo (React Native) for iOS and Android, Supabase for accounts and data, Stripe for payments.

## v1 scope
- Services: solo walk, group walk, sit-in, each 30 or 60 minutes. Prices and dog limits are set by the owner.
- Customers see free slots on a calendar and send a request. The owner approves or declines each one.
- Payment: pay by card (card saved on request, charged on approval) or, if allowed for the account, a Stripe invoice after approval.
- New customers are approved after a meet and greet before they can book.

## Booking rules (supabase/migrations)
- Bookings must fall inside working hours (default Mon to Fri, 08:00 to 18:00, Europe/London) and outside time off.
- Solo walks and sit-ins need the walker to themselves; nothing else may overlap them.
- Group walks share a slot with the same service and start time, up to the service's dog limit.
- Requested and approved bookings hold time; declined and cancelled ones free it.
- Customers create bookings only through `request_booking()`, which checks the rules under a lock.

## Testing the database rules
```
psql -v ON_ERROR_STOP=1 -f supabase/tests/stub_supabase.sql \
  -f supabase/migrations/20261123000000_init.sql \
  -f supabase/tests/booking_rules_test.sql
```
