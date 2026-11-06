-- リマインドを5分ごとに送る（Supabase から アプリの送信API を呼ぶ）
-- ※ 先に Vercel に環境変数（VAPID の鍵・CRON_SECRET）を入れてデプロイしてから実行してください。
-- ※ 下の 2か所 を書き換えてから実行：
--    <アプリのURL>   … 例 https://sharecal.vercel.app
--    <CRON_SECRET>   … Vercel に入れた CRON_SECRET と同じ文字列

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 同じ名前の予約があれば作り直す
select cron.unschedule(jobid) from cron.job where jobname = 'sharecal-reminders';

select cron.schedule(
  'sharecal-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := '<アプリのURL>/api/reminders/send',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- 確認：予約が1件あればOK
select jobname, schedule, active from cron.job where jobname = 'sharecal-reminders';
