-- Event-level sharing schema for the Next.js + Supabase calendar app.
-- Run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

alter table public.events
  add column if not exists note text;

alter table public.events
  add column if not exists all_day boolean not null default false;

alter table public.events
  add column if not exists event_visibility text not null default 'private'
  check (event_visibility in ('private', 'partner', 'together'));

create table if not exists public.schedule_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#2563eb',
  created_at timestamptz not null default now()
);

alter table public.events
  add column if not exists category_id uuid references public.schedule_categories(id) on delete set null;

create table if not exists public.event_shares (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  shared_with uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, shared_with)
);

create table if not exists public.schedule_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  title text not null,
  start_time time not null,
  end_time time not null,
  next_day_end boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.schedule_patterns
  add column if not exists category_id uuid references public.schedule_categories(id) on delete set null;

alter table public.profiles
  add column if not exists role text not null default 'user';

alter table public.profiles
  add column if not exists account_status text not null default 'active';

create table if not exists public.recurring_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  note text,
  all_day boolean not null default false,
  category_id uuid references public.schedule_categories(id) on delete set null,
  recurrence_rule text not null check (recurrence_rule in ('weekly', 'monthly', 'yearly')),
  recurrence_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.recurring_event_shares (
  id uuid primary key default gen_random_uuid(),
  recurring_event_id uuid not null references public.recurring_events(id) on delete cascade,
  shared_with uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (recurring_event_id, shared_with)
);

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  memo text,
  due_at timestamptz,
  reminder_at timestamptz,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists event_shares_event_id_idx
  on public.event_shares(event_id);

create index if not exists event_shares_shared_with_idx
  on public.event_shares(shared_with);

create index if not exists schedule_patterns_user_id_idx
  on public.schedule_patterns(user_id);

create index if not exists schedule_categories_user_id_idx
  on public.schedule_categories(user_id);

create index if not exists todos_user_id_idx
  on public.todos(user_id);

create index if not exists recurring_events_user_id_idx
  on public.recurring_events(user_id);

create index if not exists recurring_event_shares_event_id_idx
  on public.recurring_event_shares(recurring_event_id);

create index if not exists recurring_event_shares_shared_with_idx
  on public.recurring_event_shares(shared_with);

create or replace function public.is_event_owner(target_event_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    where e.id = target_event_id
      and e.user_id = target_user_id
  );
$$;

create or replace function public.is_event_shared_with(target_event_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_shares es
    where es.event_id = target_event_id
      and es.shared_with = target_user_id
  );
$$;

create or replace function public.are_connected(left_user_id uuid, right_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.connections c
    where c.status = 'accepted'
      and (
        (c.requester_id = left_user_id and c.receiver_id = right_user_id)
        or (c.requester_id = right_user_id and c.receiver_id = left_user_id)
      )
  );
$$;

create or replace function public.is_category_visible(target_category_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.schedule_categories sc
    where sc.id = target_category_id
      and sc.user_id = target_user_id
  )
  or exists (
    select 1
    from public.events e
    where e.category_id = target_category_id
      and (
        e.user_id = target_user_id
        or public.is_event_shared_with(e.id, target_user_id)
      )
  );
$$;

alter table public.events enable row level security;
alter table public.event_shares enable row level security;
alter table public.schedule_patterns enable row level security;
alter table public.schedule_categories enable row level security;
alter table public.todos enable row level security;
alter table public.recurring_events enable row level security;
alter table public.recurring_event_shares enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.event_shares to authenticated;
grant select, insert, update, delete on public.schedule_patterns to authenticated;
grant select, insert, update, delete on public.schedule_categories to authenticated;
grant select, insert, update, delete on public.todos to authenticated;
grant select, insert, update, delete on public.recurring_events to authenticated;
grant select, insert, update, delete on public.recurring_event_shares to authenticated;
grant select, insert, update, delete on public.connections to authenticated;

drop policy if exists "users can view own events" on public.events;
drop policy if exists "users can insert own events" on public.events;
drop policy if exists "users can update own events" on public.events;
drop policy if exists "users can delete own events" on public.events;
drop policy if exists "users can view shared events" on public.events;
drop policy if exists "users can view own and shared events" on public.events;
drop policy if exists "members can view calendar events" on public.events;
drop policy if exists "members can create calendar events" on public.events;
drop policy if exists "members can delete calendar events" on public.events;

create policy "users can view own and shared events"
on public.events
for select
using (
  user_id = auth.uid()
  or public.is_event_shared_with(id, auth.uid())
);

create policy "users can insert own events"
on public.events
for insert
with check (user_id = auth.uid());

create policy "users can update own events"
on public.events
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "users can delete own events"
on public.events
for delete
using (user_id = auth.uid());

drop policy if exists "event owners can create shares" on public.event_shares;
drop policy if exists "users can view shares involving them" on public.event_shares;
drop policy if exists "event owners can update shares" on public.event_shares;
drop policy if exists "event owners can delete shares" on public.event_shares;

create policy "event owners can create shares"
on public.event_shares
for insert
with check (
  public.is_event_owner(event_id, auth.uid())
  and public.are_connected(auth.uid(), shared_with)
);

create policy "users can view shares involving them"
on public.event_shares
for select
using (
  shared_with = auth.uid()
  or public.is_event_owner(event_id, auth.uid())
);

create policy "event owners can update shares"
on public.event_shares
for update
using (public.is_event_owner(event_id, auth.uid()))
with check (
  public.is_event_owner(event_id, auth.uid())
  and public.are_connected(auth.uid(), shared_with)
);

create policy "event owners can delete shares"
on public.event_shares
for delete
using (
  public.is_event_owner(event_id, auth.uid())
  or shared_with = auth.uid()
);

drop policy if exists "users can view own patterns" on public.schedule_patterns;
drop policy if exists "users can insert own patterns" on public.schedule_patterns;
drop policy if exists "users can update own patterns" on public.schedule_patterns;
drop policy if exists "users can delete own patterns" on public.schedule_patterns;

create policy "users can view own patterns"
on public.schedule_patterns
for select
using (user_id = auth.uid());

create policy "users can insert own patterns"
on public.schedule_patterns
for insert
with check (user_id = auth.uid());

create policy "users can update own patterns"
on public.schedule_patterns
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "users can delete own patterns"
on public.schedule_patterns
for delete
using (user_id = auth.uid());

drop policy if exists "users can view own categories" on public.schedule_categories;
drop policy if exists "users can insert own categories" on public.schedule_categories;
drop policy if exists "users can update own categories" on public.schedule_categories;
drop policy if exists "users can delete own categories" on public.schedule_categories;

create policy "users can view own categories"
on public.schedule_categories
for select
using (public.is_category_visible(id, auth.uid()));

create policy "users can insert own categories"
on public.schedule_categories
for insert
with check (user_id = auth.uid());

create policy "users can update own categories"
on public.schedule_categories
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "users can delete own categories"
on public.schedule_categories
for delete
using (user_id = auth.uid());

drop policy if exists "users can view own todos" on public.todos;
drop policy if exists "users can insert own todos" on public.todos;
drop policy if exists "users can update own todos" on public.todos;
drop policy if exists "users can delete own todos" on public.todos;

create policy "users can view own todos"
on public.todos
for select
using (user_id = auth.uid());

create policy "users can insert own todos"
on public.todos
for insert
with check (user_id = auth.uid());

create policy "users can update own todos"
on public.todos
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "users can delete own todos"
on public.todos
for delete
using (user_id = auth.uid());

drop policy if exists "users can view own recurring events" on public.recurring_events;
drop policy if exists "users can insert own recurring events" on public.recurring_events;
drop policy if exists "users can update own recurring events" on public.recurring_events;
drop policy if exists "users can delete own recurring events" on public.recurring_events;

create policy "users can view own recurring events"
on public.recurring_events
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.recurring_event_shares res
    where res.recurring_event_id = id
      and res.shared_with = auth.uid()
  )
);

create policy "users can insert own recurring events"
on public.recurring_events
for insert
with check (user_id = auth.uid());

create policy "users can update own recurring events"
on public.recurring_events
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "users can delete own recurring events"
on public.recurring_events
for delete
using (user_id = auth.uid());

drop policy if exists "recurring event owners can create shares" on public.recurring_event_shares;
drop policy if exists "users can view recurring shares involving them" on public.recurring_event_shares;
drop policy if exists "recurring event owners can delete shares" on public.recurring_event_shares;
drop policy if exists "shared users can remove deleted recurring shares" on public.recurring_event_shares;

create policy "recurring event owners can create shares"
on public.recurring_event_shares
for insert
with check (
  exists (
    select 1
    from public.recurring_events re
    where re.id = recurring_event_id
      and re.user_id = auth.uid()
  )
  and public.are_connected(auth.uid(), shared_with)
);

create policy "users can view recurring shares involving them"
on public.recurring_event_shares
for select
using (
  shared_with = auth.uid()
  or exists (
    select 1
    from public.recurring_events re
    where re.id = recurring_event_id
      and re.user_id = auth.uid()
  )
);

create policy "recurring event owners can delete shares"
on public.recurring_event_shares
for delete
using (
  exists (
    select 1
    from public.recurring_events re
    where re.id = recurring_event_id
      and re.user_id = auth.uid()
  )
  or shared_with = auth.uid()
);

drop policy if exists "users can delete own connections" on public.connections;

create policy "users can delete own connections"
on public.connections
for delete
using (requester_id = auth.uid() or receiver_id = auth.uid());
