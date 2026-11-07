-- ねこ図鑑の記録をアカウントごとに保存する（どの端末でも同じ図鑑になる）
-- 何度実行しても大丈夫です。
create table if not exists public.cat_finds (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sprite_id text not null,             -- 絵の番号（public/cats/catXX.png の XX）
  count integer not null default 1,    -- 見つけた回数
  first_found date not null,           -- はじめて見つけた日（日本時間）
  last_found date,                     -- 最後に見つけた日
  updated_at timestamptz not null default now(),
  primary key (user_id, sprite_id)
);

alter table public.cat_finds enable row level security;
grant select, insert, update, delete on public.cat_finds to authenticated;

drop policy if exists "cat finds own" on public.cat_finds;
create policy "cat finds own" on public.cat_finds
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
