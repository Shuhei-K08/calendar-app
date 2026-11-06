-- 通知の種類ごとのオン／オフ（人ごと。スマホ・PCどちらにも効く）
-- 行が無い人・列が無い種類は「オン」として扱います。何度実行しても大丈夫です。

create table if not exists public.notification_prefs (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  todo_remind boolean not null default true,  -- やることのリマインド
  event_remind boolean not null default true, -- 予定のリマインド
  share boolean not null default true,        -- 予定の共有
  comment boolean not null default true,      -- コメント
  reaction boolean not null default true,     -- スタンプ
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;
grant select, insert, update on public.notification_prefs to authenticated;
grant select on public.notification_prefs to service_role; -- 通知の送信（サーバー）が読む

drop policy if exists "own notification prefs" on public.notification_prefs;
create policy "own notification prefs" on public.notification_prefs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
