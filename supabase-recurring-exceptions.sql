-- 繰り返し予定を「その日だけ削除」できるようにするためのマイグレーション。
-- Supabase の SQL Editor で実行してください。
-- カレンダー上で繰り返し予定の1回分を削除すると、その日時が excluded_dates に追加され、
-- 表示から除外されます（繰り返し予定そのものは残ります）。
-- 繰り返し予定をすべて削除したい場合は、設定 → 繰り返し予定 から削除します。

alter table public.recurring_events
  add column if not exists excluded_dates timestamptz[] not null default '{}';
