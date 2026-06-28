-- リンク集の「お気に入り」用。Supabase の SQL Editor で実行してください。
-- 予定(events)単位でお気に入りフラグを持たせ、リンク集での絞り込みや
-- 予定登録時のリンク選択でお気に入りを優先表示するために使います。

alter table public.events
  add column if not exists is_favorite boolean not null default false;

create index if not exists events_is_favorite_idx
  on public.events(user_id)
  where is_favorite;
