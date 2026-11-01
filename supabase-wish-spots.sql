-- 行きたいスポット（日付なしで保存しておくお店・場所）
-- Supabase の SQL Editor で1回だけ実行してください。

create table if not exists public.wish_spots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  url text not null,
  title text,
  genre text,
  note text,
  prefecture text,
  city text,
  created_at timestamptz not null default now()
);

create index if not exists wish_spots_user_id_idx on public.wish_spots(user_id);

alter table public.wish_spots enable row level security;
grant select, insert, update, delete on public.wish_spots to authenticated;

-- 自分の分と、つながっている相手の分が見られる（ふたりで共有）
drop policy if exists "view own and partner wish spots" on public.wish_spots;
create policy "view own and partner wish spots"
on public.wish_spots for select
to authenticated
using (user_id = auth.uid() or public.are_connected(user_id, auth.uid()));

drop policy if exists "insert own wish spots" on public.wish_spots;
create policy "insert own wish spots"
on public.wish_spots for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "update own wish spots" on public.wish_spots;
create policy "update own wish spots"
on public.wish_spots for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "delete own wish spots" on public.wish_spots;
create policy "delete own wish spots"
on public.wish_spots for delete
to authenticated
using (user_id = auth.uid());
