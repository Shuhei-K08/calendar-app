-- 予定に画像を添付できるようにするためのマイグレーション。
-- Supabase の SQL Editor で実行してください。

-- 1) events / recurring_events に画像URL列を追加
alter table public.events
  add column if not exists image_url text;

alter table public.recurring_events
  add column if not exists image_url text;

-- 2) 画像を保存する Storage バケット（公開読み取り）
insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do update set public = true;

-- 3) RLS ポリシー
--   - 誰でも読み取り可（public バケットなので getPublicUrl で表示できる）
--   - ログインユーザーは自分のフォルダ（user_id/...）にのみアップロード/更新/削除できる
drop policy if exists "event_images_public_read" on storage.objects;
create policy "event_images_public_read"
  on storage.objects for select
  using (bucket_id = 'event-images');

drop policy if exists "event_images_insert_own" on storage.objects;
create policy "event_images_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "event_images_update_own" on storage.objects;
create policy "event_images_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "event_images_delete_own" on storage.objects;
create policy "event_images_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
