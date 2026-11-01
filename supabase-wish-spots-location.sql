-- 行きたいスポットに「場所（都道府県・市区町村）」を保存できるようにする
-- Supabase の SQL Editor で1回だけ実行してください。
alter table public.wish_spots add column if not exists prefecture text;
alter table public.wish_spots add column if not exists city text;
