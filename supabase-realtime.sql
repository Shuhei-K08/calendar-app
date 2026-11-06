-- 相手の変更を開いている画面に自動で反映する（Supabase Realtime）
-- Supabase の SQL Editor で1回実行してください。何度実行しても大丈夫です。
-- ※ 見られるのは今までどおり、自分が見てよい行の変更だけです（RLS がそのまま効きます）。
do $$
declare
  t text;
begin
  foreach t in array array['events', 'event_shares', 'recurring_events', 'recurring_event_shares', 'event_comments', 'todo_items', 'connections']
  loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t)
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 確認：7つの表が出ればOK
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename;
