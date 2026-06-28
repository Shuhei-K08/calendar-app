-- リンク集のジャンルを手動で編集できるようにするための列。
-- Supabase の SQL Editor で実行してください。
-- link_genre が入っている予定は、URLからの自動判定より優先して表示されます。

alter table public.events
  add column if not exists link_genre text;
