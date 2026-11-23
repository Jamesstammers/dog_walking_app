-- Dog photos live in a public storage bucket, one folder per customer: <user id>/<file>.
insert into storage.buckets (id, name, public)
values ('dog-photos', 'dog-photos', true)
on conflict (id) do nothing;

create policy "customers upload their own dog photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'dog-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "customers replace their own dog photos" on storage.objects for update to authenticated
  using (bucket_id = 'dog-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "customers delete their own dog photos" on storage.objects for delete to authenticated
  using (bucket_id = 'dog-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Walk update photos: only the business owner uploads; file names are random.
insert into storage.buckets (id, name, public)
values ('walk-photos', 'walk-photos', true)
on conflict (id) do nothing;

create policy "owner uploads walk photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'walk-photos' and public.is_owner());
