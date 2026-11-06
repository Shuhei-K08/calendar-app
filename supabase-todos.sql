-- やること（ふたりで共有／自分だけ）
-- Supabase の SQL Editor で1回実行してください。何度実行しても大丈夫です。

-- ふたりがつながっているか（承認済み）。ポリシーの中で使う
create or replace function public.are_connected(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and ((c.requester_id = a and c.receiver_id = b) or (c.requester_id = b and c.receiver_id = a))
  );
$$;
revoke all on function public.are_connected(uuid, uuid) from public, anon;
grant execute on function public.are_connected(uuid, uuid) to authenticated;

create table if not exists public.todo_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade, -- 作った人
  title text not null check (char_length(title) between 1 and 200),
  memo text check (memo is null or char_length(memo) <= 2000),
  is_shared boolean not null default true,     -- true: ふたり（つながっている相手にも見える）／false: 自分だけ
  assignee_id uuid references auth.users(id) on delete set null, -- 担当（null = どちらでも）
  due_date date,                                -- 期限
  done_at timestamptz,                          -- 完了した日時
  done_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists todo_items_owner_idx on public.todo_items(owner_id);

alter table public.todo_items enable row level security;
grant select, insert, update, delete on public.todo_items to authenticated;

-- 見られる・直せる・消せるのは「作った本人」と「ふたりのやることなら、つながっている相手」
drop policy if exists "todo read" on public.todo_items;
create policy "todo read" on public.todo_items
  for select to authenticated
  using (owner_id = auth.uid() or (is_shared and public.are_connected(owner_id, auth.uid())));

drop policy if exists "todo insert" on public.todo_items;
create policy "todo insert" on public.todo_items
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "todo update" on public.todo_items;
create policy "todo update" on public.todo_items
  for update to authenticated
  using (owner_id = auth.uid() or (is_shared and public.are_connected(owner_id, auth.uid())))
  with check (owner_id = auth.uid() or (is_shared and public.are_connected(owner_id, auth.uid())));

drop policy if exists "todo delete" on public.todo_items;
create policy "todo delete" on public.todo_items
  for delete to authenticated
  using (owner_id = auth.uid() or (is_shared and public.are_connected(owner_id, auth.uid())));

-- 作った人は変えられない／「自分だけ」に変えられるのは作った本人だけ／更新日時を自動で
create or replace function public.todo_items_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception '作った人は変更できません';
  end if;
  if old.is_shared and not new.is_shared and old.owner_id <> auth.uid() then
    raise exception '「自分だけ」に変えられるのは作った人だけです';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists todo_items_guard on public.todo_items;
create trigger todo_items_guard
  before update on public.todo_items
  for each row execute function public.todo_items_guard();

-- ── リマインド ──
alter table public.todo_items add column if not exists remind_at timestamptz;   -- 知らせる日時
alter table public.todo_items add column if not exists reminded_at timestamptz; -- 知らせ終わった日時
create index if not exists todo_items_remind_idx on public.todo_items(remind_at) where reminded_at is null and done_at is null;

-- 日時を変えたら、もう一度知らせる
create or replace function public.todo_items_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception '作った人は変更できません';
  end if;
  if old.is_shared and not new.is_shared and old.owner_id <> auth.uid() then
    raise exception '「自分だけ」に変えられるのは作った人だけです';
  end if;
  if new.remind_at is distinct from old.remind_at then
    new.reminded_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- 通知を受け取る端末（スマホ・PCのブラウザごとに1行）
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
