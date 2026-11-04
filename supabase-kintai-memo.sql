-- 勤怠：作業内容のテンプレート（API改修・レビュー対応 など）
-- Supabase の SQL Editor で1回だけ実行してください（supabase-kintai.sql の後）。
create table if not exists public.work_memo_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.work_memo_templates enable row level security;
grant select, insert, update, delete on public.work_memo_templates to authenticated;

drop policy if exists "own work memo templates" on public.work_memo_templates;
create policy "own work memo templates" on public.work_memo_templates
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
