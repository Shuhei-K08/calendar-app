-- 名前（本名）：勤怠表など書類に記入する名前。ふだんの表示はニックネーム（username）のまま
-- 何度実行しても大丈夫です。
alter table public.profiles add column if not exists full_name text;

notify pgrst, 'reload schema';
