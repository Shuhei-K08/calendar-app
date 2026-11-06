-- 予定の通知（アプリを閉じていても届く）
--  1) 予定の前に知らせる（知らせてほしい予定にだけ、設定した本人に届く）
--  2) 相手が予定を共有したら知らせる
-- ※ supabase-todos.sql（通知を受け取る端末の表）を実行したあとに、1回実行してください。何度実行しても大丈夫です。

-- ── 1) 予定の前に知らせる ──
create table if not exists public.event_reminders (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  remind_minutes integer not null check (remind_minutes between -1440 and 10080), -- 開始の何分前（マイナスは開始の後。終日の「当日の朝」用）
  remind_at timestamptz,      -- 知らせる日時（自動で計算）
  reminded_at timestamptz,    -- 知らせ終わった日時
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_reminders_due_idx on public.event_reminders(remind_at) where reminded_at is null;

alter table public.event_reminders enable row level security;
grant select, insert, update, delete on public.event_reminders to authenticated;
grant select, insert, update, delete on public.event_reminders to service_role;

drop policy if exists "own event reminders" on public.event_reminders;
create policy "own event reminders" on public.event_reminders
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = event_id and (e.user_id = auth.uid() or public.is_event_shared_with(e.id, auth.uid()))
    )
  );

-- 知らせる日時 = 予定の開始 − 何分前
create or replace function public.event_reminders_fill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select e.start_at - make_interval(mins => new.remind_minutes) into new.remind_at
  from public.events e where e.id = new.event_id;
  if tg_op = 'INSERT' or new.remind_minutes is distinct from old.remind_minutes then
    new.reminded_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists event_reminders_fill on public.event_reminders;
create trigger event_reminders_fill
  before insert or update on public.event_reminders
  for each row execute function public.event_reminders_fill();

-- 予定の日時を変えたら、知らせる日時も合わせて、もう一度知らせる
create or replace function public.events_move_reminders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.start_at is distinct from old.start_at then
    update public.event_reminders
      set remind_at = new.start_at - make_interval(mins => remind_minutes), reminded_at = null
      where event_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists events_move_reminders on public.events;
create trigger events_move_reminders
  after update of start_at on public.events
  for each row execute function public.events_move_reminders();

-- ── 2) 相手が予定を共有したら知らせる ──
-- 送る通知をためておく表（アプリからは読めない。送信APIだけが使う）
create table if not exists public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  url text not null default '/',
  tag text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notification_queue_unsent_idx on public.notification_queue(created_at) where sent_at is null;
alter table public.notification_queue enable row level security;
revoke all on public.notification_queue from anon, authenticated;
grant select, insert, update, delete on public.notification_queue to service_role;

-- 共有の通知を1件ためる（予定を編集するたびに共有し直しても、同じ予定では二度送らない）
create or replace function public.enqueue_share(p_user uuid, p_owner uuid, p_title text, p_start timestamptz, p_all_day boolean, p_tag text, p_recurring boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_name text;
  when_text text;
begin
  if p_title is null or p_owner = p_user then
    return;
  end if;
  if exists (select 1 from public.notification_queue q where q.user_id = p_user and q.tag = p_tag) then
    return;
  end if;
  select coalesce(nullif(p.username, ''), '相手') into owner_name from public.profiles p where p.id = p_owner;
  when_text := to_char(p_start at time zone 'Asia/Tokyo', 'FMMM/FMDD')
    || case when coalesce(p_all_day, false) then '' else ' ' || to_char(p_start at time zone 'Asia/Tokyo', 'FMHH24:MI') end
    || case when p_recurring then '〜 くり返し' else '' end;
  insert into public.notification_queue (user_id, title, body, url, tag)
  values (p_user, coalesce(owner_name, '相手') || 'さんが予定を共有しました', p_title || '（' || when_text || '）', '/', p_tag);
end;
$$;
revoke all on function public.enqueue_share(uuid, uuid, text, timestamptz, boolean, text, boolean) from public, anon, authenticated;

create or replace function public.queue_event_share()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev record;
begin
  select e.title, e.start_at, e.all_day, e.user_id into ev from public.events e where e.id = new.event_id;
  if found then
    perform public.enqueue_share(new.shared_with, ev.user_id, ev.title, ev.start_at, ev.all_day, 'share-' || new.event_id::text, false);
  end if;
  return new;
end;
$$;

create or replace function public.queue_recurring_share()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev record;
begin
  select r.title, r.start_at, r.all_day, r.user_id into ev from public.recurring_events r where r.id = new.recurring_event_id;
  if found then
    perform public.enqueue_share(new.shared_with, ev.user_id, ev.title, ev.start_at, ev.all_day, 'share-r-' || new.recurring_event_id::text, true);
  end if;
  return new;
end;
$$;

drop trigger if exists queue_share_notification on public.event_shares;
drop trigger if exists queue_share_notification on public.recurring_event_shares;
drop function if exists public.queue_share_notification();

drop trigger if exists queue_event_share on public.event_shares;
create trigger queue_event_share
  after insert on public.event_shares
  for each row execute function public.queue_event_share();

drop trigger if exists queue_recurring_share on public.recurring_event_shares;
create trigger queue_recurring_share
  after insert on public.recurring_event_shares
  for each row execute function public.queue_recurring_share();

-- 古い通知の記録は30日で消す（送信APIが掃除します）
