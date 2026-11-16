-- ねこの絵を管理画面から追加できるようにする（追加・変更・削除は管理者だけ。見るのはログインしている人みんな）
-- Supabase の SQL Editor で1回実行してください。何度実行しても大丈夫です。
-- （public.is_admin は supabase-event-sharing.sql で作ったものを使います）

create table if not exists public.cat_sprites (
  id text primary key check (id ~ '^u[0-9a-z]{6,24}$'),           -- 図鑑の記録（cat_finds.sprite_id）と同じ番号
  cat text not null check (cat in ('a', 'b', 'both')),              -- a = おこげ／b = るる／both = 2匹
  label text not null check (char_length(label) between 1 and 20),  -- 絵の名前（例：箱に入る）
  season text check (season is null or season in ('xmas', 'newyear')), -- 期間限定（なし = いつでも）
  image_path text not null,                                         -- Storage（cat-sprites）の中の場所
  enabled boolean not null default true,                            -- false にすると、出なくなり図鑑からも隠れる
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.cat_sprites enable row level security;
grant select, insert, update, delete on public.cat_sprites to authenticated;

drop policy if exists "cat sprites read" on public.cat_sprites;
create policy "cat sprites read" on public.cat_sprites
  for select to authenticated
  using (enabled or public.is_admin(auth.uid()));

drop policy if exists "cat sprites admin write" on public.cat_sprites;
create policy "cat sprites admin write" on public.cat_sprites
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- 絵の置き場所（公開。PNG だけ、1枚 2MB まで）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cat-sprites', 'cat-sprites', true, 2097152, array['image/png'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/png'];

drop policy if exists "cat_sprites_public_read" on storage.objects;
create policy "cat_sprites_public_read"
  on storage.objects for select
  using (bucket_id = 'cat-sprites');

drop policy if exists "cat_sprites_admin_insert" on storage.objects;
create policy "cat_sprites_admin_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'cat-sprites' and public.is_admin(auth.uid()));

drop policy if exists "cat_sprites_admin_update" on storage.objects;
create policy "cat_sprites_admin_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'cat-sprites' and public.is_admin(auth.uid()));

drop policy if exists "cat_sprites_admin_delete" on storage.objects;
create policy "cat_sprites_admin_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'cat-sprites' and public.is_admin(auth.uid()));

notify pgrst, 'reload schema';
