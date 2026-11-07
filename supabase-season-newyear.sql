-- 期間限定のデザイン：年末年始の期間（管理画面から変えられる）
-- 先に supabase-season.sql を実行しておいてください。
-- 何度実行しても大丈夫です（すでに入っている期間は変えません）。

alter table public.app_settings add column if not exists newyear_start date; -- 年末年始仕様の始まり（日本時間の日付）
alter table public.app_settings add column if not exists newyear_end date;   -- 終わり（この日まで）

-- 初期値：クリスマスの翌日から 1/7 まで
update public.app_settings
set newyear_start = date '2026-12-26', newyear_end = date '2027-01-07'
where id = 1 and newyear_start is null and newyear_end is null;

notify pgrst, 'reload schema';
