-- 予定にコメント・スタンプが付いたら、その予定を見られるほかの人に知らせる
-- ※ supabase-event-comments.sql と supabase-event-notify.sql（お知らせをためる表）を実行したあとに、1回実行してください。何度実行しても大丈夫です。

create or replace function public.queue_comment_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev_title text;
  ev_owner uuid;
  from_name text;
  label text;
  open_key text;
  n_title text;
  n_body text;
  n_tag text;
  recipient uuid;
begin
  -- どの予定へのコメントか
  if new.event_id is not null then
    select e.title, e.user_id into ev_title, ev_owner from public.events e where e.id = new.event_id;
    open_key := 'e:' || new.event_id::text;
  else
    select r.title, r.user_id into ev_title, ev_owner from public.recurring_events r where r.id = new.recurring_event_id;
    open_key := 'r:' || new.recurring_event_id::text;
  end if;
  if ev_owner is null then
    return new;
  end if;

  select coalesce(nullif(p.username, ''), '相手') into from_name from public.profiles p where p.id = new.user_id;
  from_name := coalesce(from_name, '相手');

  if new.reaction is not null and nullif(btrim(coalesce(new.body, '')), '') is null then
    label := case new.reaction
      when '👍' then '了解'
      when '🙏' then 'ありがとう'
      when '❤️' then 'いいね'
      when '🎉' then '楽しみ'
      when '😢' then 'ざんねん'
      else null
    end;
    n_title := from_name || 'さんがスタンプ ' || new.reaction;
    n_body := '「' || coalesce(ev_title, '予定') || '」' || coalesce('に ' || label, '');
    n_tag := 'react-' || open_key || '-' || new.user_id::text || '-' || new.reaction;
  else
    n_title := from_name || 'さんからコメント';
    n_body := '「' || coalesce(ev_title, '予定') || '」' || left(btrim(new.body), 80);
    n_tag := 'comment-' || new.id::text;
  end if;

  -- 予定の持ち主と、共有されている人（コメントした本人は除く）
  for recipient in
    select ev_owner
    union
    select s.shared_with from public.event_shares s where new.event_id is not null and s.event_id = new.event_id
    union
    select s.shared_with from public.recurring_event_shares s where new.recurring_event_id is not null and s.recurring_event_id = new.recurring_event_id
  loop
    continue when recipient is null or recipient = new.user_id;
    -- 同じスタンプの押し直し（取り消し→もう一度）は1時間に1回だけ知らせる
    continue when n_tag like 'react-%' and exists (
      select 1 from public.notification_queue q
      where q.user_id = recipient and q.tag = n_tag and q.created_at > now() - interval '1 hour'
    );
    insert into public.notification_queue (user_id, title, body, url, tag)
    values (recipient, n_title, n_body, '/?open=' || open_key, n_tag);
  end loop;
  return new;
end;
$$;

drop trigger if exists queue_comment_notification on public.event_comments;
create trigger queue_comment_notification
  after insert on public.event_comments
  for each row execute function public.queue_comment_notification();
