-- Minimal stand-ins for Supabase's auth schema so migrations run on plain Postgres.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('test.uid', true), '')::uuid $$;
