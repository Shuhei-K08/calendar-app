-- 勤怠：案件の金額が「税抜」か「税込」か（初期値は税抜）
-- Supabase の SQL Editor で1回実行してください。
alter table public.work_projects
  add column if not exists price_tax text not null default 'excluded'
  check (price_tax in ('excluded', 'included'));
