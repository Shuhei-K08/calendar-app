-- 誕生日の特設ページ（カウントダウン・当日のおめでとう）
-- 見られるのは本人と、つながっている相手だけ。写真も同じ人だけが読めます。
-- 先に supabase-event-sharing.sql（public.are_connected）が実行済みであること。
-- 何度実行しても大丈夫です。

-- 1) 誕生日（profiles は「本人とつながっている相手」だけが読める）
alter table public.profiles add column if not exists birthday date;

-- 2) 特設ページの写真の一覧
create table if not exists public.birthday_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade, -- 誕生日の人
  slot text not null check (slot in ('hero', 'today', 'album')),       -- hero: カウントダウンの切り抜き / today: 当日の切り抜き / album: 写真
  path text not null,                                                  -- birthday-photos バケットの中の場所（<owner_id>/...）
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists birthday_photos_owner_idx on public.birthday_photos (owner_id, slot, sort);

alter table public.birthday_photos enable row level security;
grant select, insert, update, delete on public.birthday_photos to authenticated;

drop policy if exists "birthday photos read own or connected" on public.birthday_photos;
create policy "birthday photos read own or connected" on public.birthday_photos
  for select to authenticated
  using (owner_id = auth.uid() or public.are_connected(owner_id, auth.uid()));

drop policy if exists "birthday photos write own" on public.birthday_photos;
create policy "birthday photos write own" on public.birthday_photos
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- 3) 写真の置き場所（非公開。見るときは期限付きURL）
insert into storage.buckets (id, name, public)
values ('birthday-photos', 'birthday-photos', false)
on conflict (id) do update set public = false;

drop policy if exists "birthday_photos_read_own_or_connected" on storage.objects;
create policy "birthday_photos_read_own_or_connected"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'birthday-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.are_connected(((storage.foldername(name))[1])::uuid, auth.uid())
    )
  );

drop policy if exists "birthday_photos_insert_own" on storage.objects;
create policy "birthday_photos_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'birthday-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "birthday_photos_delete_own" on storage.objects;
create policy "birthday_photos_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'birthday-photos' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';
