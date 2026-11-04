-- セキュリティ修正 その1（すぐ実行してOK・アプリの変更は不要）
-- Supabase の SQL Editor で1回実行してください。何度実行しても大丈夫です。

-- ── 1) だれでも全員のプロフィールを書き換えられる設定を消す ──
drop policy if exists "service_role_admin_operations" on public.profiles;

-- 重なっていた「自分のプロフィールを更新」系をまとめて1つに
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "users_can_update_own_profile" on public.profiles;
drop policy if exists "自分のプロフィールを更新できる" on public.profiles;
drop policy if exists "profiles update own basic or admin" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ── 2) 自分で自分を管理者にできないようにする ──
-- role（権限）は、管理者か、サーバー（管理用の鍵）からしか変えられない
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- サーバー（service_role）・SQL Editor・ログイン処理からの変更はそのまま通す
  if current_user in ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.role is distinct from 'user' and not public.is_admin(auth.uid()) then
      new.role := 'user';
    end if;
    return new;
  end if;
  if new.role is distinct from old.role and not public.is_admin(auth.uid()) then
    raise exception '権限（role）は変更できません';
  end if;
  if new.id is distinct from old.id then
    raise exception 'id は変更できません';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before insert or update on public.profiles
  for each row execute function public.protect_profile_role();

-- ── 3) つながり申請は「申請中」でしか作れないようにする ──
-- （相手の承認なしに、いきなり「つながっている」状態を作れないように）
drop policy if exists "Users can create connection requests" on public.connections;
create policy "Users can create connection requests" on public.connections
  for insert to authenticated
  with check (requester_id = auth.uid() and receiver_id <> auth.uid() and status = 'pending');

-- ── 4) 念のため：だれでも予定を消せる設定（前に消したもの） ──
drop policy if exists "Anyone can delete events" on public.events;

-- ── 確認：いまの profiles の更新ポリシー（1行だけになっていればOK） ──
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles' and cmd = 'UPDATE';
