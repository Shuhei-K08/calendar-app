-- やること：リマインドを何回でも／優先度／カテゴリー
-- Supabase の SQL Editor で1回実行してください。何度実行しても大丈夫です。
-- （先に supabase-todos.sql と supabase-todo-due-time.sql を実行しておいてください）

-- ── 優先度（0 = なし、1 = 低、2 = 中、3 = 高） ──
alter table public.todo_items add column if not exists priority smallint not null default 0;
alter table public.todo_items drop constraint if exists todo_items_priority_check;
alter table public.todo_items add constraint todo_items_priority_check check (priority between 0 and 3);

-- ── カテゴリー（自分で作る。つながっている相手とは同じものを使う） ──
create table if not exists public.todo_categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  color text not null default 'teal',
  created_at timestamptz not null default now()
);
create index if not exists todo_categories_owner_idx on public.todo_categories (owner_id);

alter table public.todo_categories enable row level security;
grant select, insert, update, delete on public.todo_categories to authenticated;
grant select on public.todo_categories to service_role;

drop policy if exists "todo category read" on public.todo_categories;
create policy "todo category read" on public.todo_categories
  for select to authenticated
  using (owner_id = auth.uid() or public.are_connected(owner_id, auth.uid()));

drop policy if exists "todo category insert" on public.todo_categories;
create policy "todo category insert" on public.todo_categories
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "todo category update" on public.todo_categories;
create policy "todo category update" on public.todo_categories
  for update to authenticated
  using (owner_id = auth.uid() or public.are_connected(owner_id, auth.uid()))
  with check (owner_id = auth.uid() or public.are_connected(owner_id, auth.uid()));

drop policy if exists "todo category delete" on public.todo_categories;
create policy "todo category delete" on public.todo_categories
  for delete to authenticated
  using (owner_id = auth.uid() or public.are_connected(owner_id, auth.uid()));

-- カテゴリーを消したら、そのやることは「カテゴリーなし」になる
alter table public.todo_items add column if not exists category_id uuid references public.todo_categories (id) on delete set null;

-- ── リマインド（1つのやることに何回でも。完了したやることには送らない） ──
create table if not exists public.todo_reminders (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references public.todo_items (id) on delete cascade,
  remind_at timestamptz not null,   -- 知らせる日時
  reminded_at timestamptz,          -- 知らせ終わった日時
  created_at timestamptz not null default now()
);
create index if not exists todo_reminders_todo_idx on public.todo_reminders (todo_id);
create index if not exists todo_reminders_due_idx on public.todo_reminders (remind_at) where reminded_at is null;

alter table public.todo_reminders enable row level security;
grant select, insert, update, delete on public.todo_reminders to authenticated;
grant select, insert, update, delete on public.todo_reminders to service_role; -- 通知の送信（サーバー）が使う

-- 見たり直したりできるのは、そのやることを見られる人（やることの決まりがそのまま効く）
drop policy if exists "todo reminder access" on public.todo_reminders;
create policy "todo reminder access" on public.todo_reminders
  for all to authenticated
  using (exists (select 1 from public.todo_items t where t.id = todo_id))
  with check (exists (select 1 from public.todo_items t where t.id = todo_id));

-- 日時を変えたら、もう一度知らせる
create or replace function public.todo_reminders_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.remind_at is distinct from old.remind_at then
    new.reminded_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists todo_reminders_guard on public.todo_reminders;
create trigger todo_reminders_guard
  before update on public.todo_reminders
  for each row execute function public.todo_reminders_guard();

-- これまでの「1回だけのリマインド」を、新しい表へ移す（移したあとは古い列を空にする）
insert into public.todo_reminders (todo_id, remind_at, reminded_at)
select id, remind_at, reminded_at from public.todo_items where remind_at is not null;
update public.todo_items set remind_at = null, reminded_at = null where remind_at is not null;

-- 相手の変更を開いている画面にすぐ反映する（Realtime）
do $$
declare
  t text;
begin
  foreach t in array array['todo_categories', 'todo_reminders']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
