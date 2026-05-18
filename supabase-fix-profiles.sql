-- Fix for profiles table RLS and username issues
-- Run this in the Supabase SQL editor after the main schema script

-- 1. Enable RLS on profiles table if not already enabled
alter table public.profiles enable row level security;

-- 2. Grant permissions to authenticated users on profiles
grant select, insert, update, delete on public.profiles to authenticated;

-- 3. Drop existing problematic policies if they exist
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Users can view all profiles" on public.profiles;
drop policy if exists "Users can create profile" on public.profiles;

-- 4. Create RLS policies for profiles table
-- Users can view all profiles (needed for sharing/connection features)
create policy "Users can view all profiles"
on public.profiles
for select
using (true);

-- Users can update their own profile
create policy "Users can update their own profile"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

-- Users can create their own profile (via auth trigger)
create policy "Users can create their own profile"
on public.profiles
for insert
with check (id = auth.uid());

-- 5. Fill in NULL usernames with email prefix (taking the part before @)
-- This handles users who signed up without setting a username
update public.profiles
set username =
  case
    when username is not null then username
    else split_part((select email from auth.users where auth.users.id = profiles.id), '@', 1)
  end
where username is null or username = '';

-- 6. Set a default username for any remaining empty usernames
update public.profiles
set username = 'User_' || substr(id::text, 1, 8)
where username is null or trim(username) = '';

-- 7. Add NOT NULL constraint to username if not already present
-- (This ensures new users must have a username)
alter table public.profiles
alter column username set not null;
