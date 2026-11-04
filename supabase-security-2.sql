-- セキュリティ修正 その2
-- ※ アプリを push してデプロイし終わってから実行してください（先に実行すると、画像や共有IDの検索が使えなくなります）。
-- Supabase の SQL Editor で1回実行してください。何度実行しても大丈夫です。

-- ── 1) 共有IDから相手を探す専用の関数（相手の id だけ返す） ──
create or replace function public.find_profile_by_share_code(code text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles
  where share_code = upper(trim(code))
  limit 1;
$$;
revoke all on function public.find_profile_by_share_code(text) from public, anon;
grant execute on function public.find_profile_by_share_code(text) to authenticated;

-- ── 2) プロフィールを読めるのは「自分・つながっている（申請中を含む）相手・管理者」だけ ──
drop policy if exists "Users can read profiles" on public.profiles;
drop policy if exists "Users can view all profiles" on public.profiles;
drop policy if exists "profiles select own or admin" on public.profiles;
drop policy if exists "users_can_view_own_profile" on public.profiles;
drop policy if exists "自分のプロフィールを読める" on public.profiles;
drop policy if exists "profiles read own or connected" on public.profiles;
create policy "profiles read own or connected" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin(auth.uid())
    or exists (
      select 1 from public.connections c
      where (c.requester_id = auth.uid() and c.receiver_id = profiles.id)
         or (c.receiver_id = auth.uid() and c.requester_id = profiles.id)
    )
  );

-- 重なっていた「自分のプロフィールを作る」をまとめる
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "自分のプロフィールを作成できる" on public.profiles;
drop policy if exists "Users can create their own profile" on public.profiles;
drop policy if exists "profiles insert own row" on public.profiles;
create policy "profiles insert own row" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

-- ── 3) 予定の画像を非公開に（見られるのは本人と、つながっている相手だけ） ──
update storage.buckets set public = false where id = 'event-images';

drop policy if exists "event_images_public_read" on storage.objects;
drop policy if exists "event_images_read_own_or_connected" on storage.objects;
create policy "event_images_read_own_or_connected" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'event-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.connections c
        where c.status = 'accepted'
          and (
            (c.requester_id = auth.uid() and c.receiver_id::text = (storage.foldername(name))[1])
            or (c.receiver_id = auth.uid() and c.requester_id::text = (storage.foldername(name))[1])
          )
      )
    )
  );

-- ── 4) 予定・つながりの重なっていたポリシーを整理（ログインしていない人には何も見せない） ──
drop policy if exists "users can delete own events" on public.events;
drop policy if exists "users can insert own events" on public.events;
drop policy if exists "users can update own events" on public.events;
drop policy if exists "users can view own and shared events" on public.events;
drop policy if exists "Users can read own events" on public.events;
drop policy if exists "events read own or shared" on public.events;
create policy "events read own or shared" on public.events
  for select to authenticated
  using (user_id = auth.uid() or public.is_event_shared_with(id, auth.uid()));

drop policy if exists "users can delete own connections" on public.connections;
drop policy if exists "connections delete own" on public.connections;
create policy "connections delete own" on public.connections
  for delete to authenticated
  using (requester_id = auth.uid() or receiver_id = auth.uid());

-- ── 確認 ──
select tablename, policyname, cmd, roles
from pg_policies
where schemaname in ('public', 'storage') and tablename in ('profiles', 'events', 'connections', 'objects')
order by tablename, cmd, policyname;
