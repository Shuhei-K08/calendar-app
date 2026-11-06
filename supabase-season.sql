-- 期間限定のデザイン（クリスマスなど）の期間。管理画面から変えられる
-- 何度実行しても大丈夫です（すでにある期間は変えません）。

create table if not exists public.app_settings (
  id integer primary key default 1 check (id = 1), -- 1行だけ
  xmas_start date,  -- クリスマス仕様の始まり（日本時間の日付）
  xmas_end date,    -- 終わり（この日まで）
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id, xmas_start, xmas_end)
values (1, date '2026-11-07', date '2026-12-25')
on conflict (id) do nothing;

alter table public.app_settings enable row level security;
grant select on public.app_settings to anon, authenticated;
grant update on public.app_settings to authenticated;

-- だれでも読める／変えられるのは管理者だけ
drop policy if exists "read app settings" on public.app_settings;
create policy "read app settings" on public.app_settings
  for select to anon, authenticated using (true);

drop policy if exists "admin updates app settings" on public.app_settings;
create policy "admin updates app settings" on public.app_settings
  for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

notify pgrst, 'reload schema';
