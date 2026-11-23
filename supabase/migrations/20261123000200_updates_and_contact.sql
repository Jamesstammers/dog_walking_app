-- Walk updates: the owner posts photos and captions, tagged with the dogs in them.
-- Each customer sees only the posts that tag one of their own dogs.
create table posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references profiles on delete cascade,
  caption     text not null default '',
  photo_url   text,
  created_at  timestamptz not null default now()
);

create table post_dogs (
  post_id     uuid not null references posts on delete cascade,
  dog_id      uuid not null references dogs on delete cascade,
  primary key (post_id, dog_id)
);

create index posts_created_idx on posts (created_at desc);
create index post_dogs_dog_idx on post_dogs (dog_id);

alter table posts enable row level security;
alter table post_dogs enable row level security;

create policy "owner manages posts" on posts for all using (is_owner()) with check (is_owner());
create policy "customers see posts about their dogs" on posts for select using (
  exists (select 1 from post_dogs pd join dogs d on d.id = pd.dog_id
          where pd.post_id = posts.id and d.owner_id = auth.uid())
);

create policy "owner manages post tags" on post_dogs for all using (is_owner()) with check (is_owner());
create policy "customers see tags on their dogs" on post_dogs for select using (
  exists (select 1 from dogs d where d.id = dog_id and d.owner_id = auth.uid())
);

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
  hours_note  text
);
insert into business_info (id) values (1);

alter table business_info enable row level security;
create policy "anyone reads contact details" on business_info for select using (true);
create policy "owner edits contact details" on business_info for update using (is_owner()) with check (is_owner());
