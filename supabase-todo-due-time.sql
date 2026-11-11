-- やることの期限に「時刻」を付けられるようにする（なしなら、その日のうち）
-- Supabase の SQL Editor で1回実行してください。何度実行しても大丈夫です。
alter table public.todo_items add column if not exists due_time time; -- 期限の時刻（null = 時刻なし）

notify pgrst, 'reload schema';
