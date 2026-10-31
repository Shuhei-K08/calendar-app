-- 共有予定へのひとことコメント・リアクション
-- Supabase ダッシュボードの SQL Editor で1回実行してください。
-- 前提: supabase-event-sharing.sql（is_event_owner などの関数）が実行済みであること。

create table if not exists public.event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  recurring_event_id uuid references public.recurring_events(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text check (body is null or char_length(body) <= 500),
  reaction text check (reaction is null or char_length(reaction) <= 16),
  created_at timestamptz not null default now(),
  -- 通常の予定か繰り返し予定のどちらか一方に付く
  constraint event_comments_one_target check ((event_id is null) <> (recurring_event_id is null)),
  -- 本文かリアクションのどちらかは必須
  constraint event_comments_has_content check (
    nullif(btrim(coalesce(body, '')), '') is not null or reaction is not null
  )
);

create index if not exists event_comments_event_id_idx
  on public.event_comments(event_id, created_at);
create index if not exists event_comments_recurring_event_id_idx
  on public.event_comments(recurring_event_id, created_at);

-- その予定を見られる人（持ち主 or 共有された人）かどうか
create or replace function public.can_view_comment_target(
  target_event_id uuid,
  target_recurring_event_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when target_event_id is not null then
      public.is_event_owner(target_event_id, target_user_id)
      or public.is_event_shared_with(target_event_id, target_user_id)
    when target_recurring_event_id is not null then
      public.is_recurring_event_owner(target_recurring_event_id, target_user_id)
      or public.is_recurring_event_shared_with(target_recurring_event_id, target_user_id)
    else false
  end;
$$;

alter table public.event_comments enable row level security;

drop policy if exists "users can view comments on visible events" on public.event_comments;
create policy "users can view comments on visible events"
on public.event_comments
for select
to authenticated
using (public.can_view_comment_target(event_id, recurring_event_id, auth.uid()));

drop policy if exists "users can comment on visible events" on public.event_comments;
create policy "users can comment on visible events"
on public.event_comments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.can_view_comment_target(event_id, recurring_event_id, auth.uid())
);

drop policy if exists "users can delete own comments" on public.event_comments;
create policy "users can delete own comments"
on public.event_comments
for delete
to authenticated
using (user_id = auth.uid());

grant select, insert, delete on public.event_comments to authenticated;
