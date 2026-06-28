-- AI読み取り（Gemini OCR）の使用量を記録するテーブル。
-- Supabase の SQL Editor で実行してください。
-- 管理者画面で「今日の読み取り回数・使用トークン・上限到達」を表示するために使います。

create table if not exists public.ocr_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'success' check (status in ('success', 'limit', 'error')),
  prompt_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ocr_usage_created_at_idx on public.ocr_usage(created_at);

-- RLSを有効化。ポリシーは作らない＝一般ユーザーからは読み書き不可。
-- サーバー側の service role キー（RLSをバイパス）からのみ記録・集計する。
alter table public.ocr_usage enable row level security;
