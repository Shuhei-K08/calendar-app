-- 勤怠（フリーランスの稼働管理）
-- Supabase の SQL Editor で1回だけ実行してください。
-- どのテーブルも本人だけが読み書きできます（相手には見えません）。

-- 案件（何月から何月まで、精算幅、単価など）
create table if not exists public.work_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  start_month date not null,              -- その月の1日
  end_month date,                         -- その月の1日。null なら終了未定
  range_min numeric(6, 2) not null default 140,
  range_max numeric(6, 2) not null default 180,
  rounding_min integer not null default 15,
  default_start time not null default '10:00',
  default_end time not null default '19:00',
  default_break_min integer not null default 60,
  monthly_rate integer,                   -- 月額単価（任意）
  deduction_rate integer,                 -- 下限を下回ったときの控除（円/時間・任意）
  excess_rate integer,                    -- 上限を超えたときの超過（円/時間・任意）
  created_at timestamptz not null default now()
);

-- テンプレート（通常・午後から など、すばやく入力するため）
create table if not exists public.work_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null,
  start_time time not null,
  end_time time not null,
  break_min integer not null default 60,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 日ごとの記録
create table if not exists public.work_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  work_date date not null,
  start_time time,
  end_time time,
  break_min integer not null default 0,
  is_off boolean not null default false,  -- 休み
  memo text,
  updated_at timestamptz not null default now(),
  unique (user_id, work_date)
);

create index if not exists work_days_user_date_idx on public.work_days(user_id, work_date);

alter table public.work_projects enable row level security;
alter table public.work_templates enable row level security;
alter table public.work_days enable row level security;

grant select, insert, update, delete on public.work_projects to authenticated;
grant select, insert, update, delete on public.work_templates to authenticated;
grant select, insert, update, delete on public.work_days to authenticated;

drop policy if exists "own work projects" on public.work_projects;
create policy "own work projects" on public.work_projects
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own work templates" on public.work_templates;
create policy "own work templates" on public.work_templates
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own work days" on public.work_days;
create policy "own work days" on public.work_days
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 勤怠表テンプレート（現場の Excel） ──
-- 元の Excel ファイルは Storage の非公開バケット work-templates に置き、
-- 「どのセルに何を書くか」の設定をこの表に保存します。案件ごとに複数登録できます。
create table if not exists public.work_export_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.work_projects(id) on delete cascade,
  name text not null,                     -- 表示名（例：A社 勤怠表）
  file_name text not null,                -- 元のファイル名
  storage_path text not null,             -- work-templates バケット内の場所（<user_id>/<id>.xlsx）
  mapping jsonb not null,                 -- どのシート・行・列に書くか
  last_used_at timestamptz,               -- 書き出し画面で最初に選ばれる
  created_at timestamptz not null default now()
);

create index if not exists work_export_templates_project_idx on public.work_export_templates(project_id);
alter table public.work_export_templates enable row level security;
grant select, insert, update, delete on public.work_export_templates to authenticated;

drop policy if exists "own export templates" on public.work_export_templates;
create policy "own export templates" on public.work_export_templates
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ファイル置き場（非公開・10MBまで）。自分のフォルダ（<user_id>/）だけ読み書きできます
insert into storage.buckets (id, name, public, file_size_limit)
values ('work-templates', 'work-templates', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "own work template files read" on storage.objects;
create policy "own work template files read" on storage.objects
  for select to authenticated
  using (bucket_id = 'work-templates' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own work template files write" on storage.objects;
create policy "own work template files write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'work-templates' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own work template files update" on storage.objects;
create policy "own work template files update" on storage.objects
  for update to authenticated
  using (bucket_id = 'work-templates' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own work template files delete" on storage.objects;
create policy "own work template files delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'work-templates' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── 「勤怠を使う」の設定（設定画面のオン／オフ。初期値はオフ） ──
alter table public.profiles add column if not exists use_kintai boolean not null default false;
