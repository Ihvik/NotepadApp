-- ============================================
-- Supabase SQL: Shared Lists App
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- 1. CREATE ALL TABLES FIRST (no policies yet)
-- ============================================

-- PROFILES
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  display_name text,
  created_at timestamptz default now()
);

-- LISTS
create table public.lists (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  icon text default '📝',
  created_by uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now()
);

-- LIST_MEMBERS
create table public.list_members (
  list_id uuid references public.lists(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (list_id, user_id)
);

-- ITEMS
create table public.items (
  id uuid default uuid_generate_v4() primary key,
  list_id uuid references public.lists(id) on delete cascade not null,
  text text not null,
  checked boolean default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  position integer default 0
);

-- ============================================
-- 2. ENABLE RLS ON ALL TABLES
-- ============================================

alter table public.profiles enable row level security;
alter table public.lists enable row level security;
alter table public.list_members enable row level security;
alter table public.items enable row level security;

-- ============================================
-- 3. POLICIES (all tables exist now)
-- ============================================

-- PROFILES policies
create policy "Users can view all profiles"
  on public.profiles for select using (true);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- LISTS policies
create policy "Users can view their lists"
  on public.lists for select
  using (id in (select list_id from public.list_members where user_id = auth.uid()));

create policy "Users can create lists"
  on public.lists for insert
  with check (auth.uid() = created_by);

create policy "Users can update their lists"
  on public.lists for update
  using (id in (select list_id from public.list_members where user_id = auth.uid()));

create policy "Users can delete own lists"
  on public.lists for delete
  using (created_by = auth.uid());

-- LIST_MEMBERS policies
create policy "Users can view their memberships"
  on public.list_members for select
  using (user_id = auth.uid());

create policy "List creators can add members"
  on public.list_members for insert
  with check (
    list_id in (select id from public.lists where created_by = auth.uid())
    or user_id = auth.uid()
  );

create policy "List creators can remove members"
  on public.list_members for delete
  using (
    list_id in (select id from public.lists where created_by = auth.uid())
    or user_id = auth.uid()
  );

-- ITEMS policies
create policy "Users can view items in their lists"
  on public.items for select
  using (list_id in (select list_id from public.list_members where user_id = auth.uid()));

create policy "Users can add items to their lists"
  on public.items for insert
  with check (list_id in (select list_id from public.list_members where user_id = auth.uid()));

create policy "Users can update items in their lists"
  on public.items for update
  using (list_id in (select list_id from public.list_members where user_id = auth.uid()));

create policy "Users can delete items in their lists"
  on public.items for delete
  using (list_id in (select list_id from public.list_members where user_id = auth.uid()));

-- ============================================
-- 4. AUTO-CREATE PROFILE ON SIGNUP
-- ============================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- 5. ENABLE REALTIME
-- ============================================

alter publication supabase_realtime add table public.lists;
alter publication supabase_realtime add table public.items;
alter publication supabase_realtime add table public.list_members;

-- ============================================
-- 6. HELPER FUNCTIONS
-- ============================================

create or replace function public.create_list_with_member(
  list_name text,
  list_icon text default '📝'
)
returns uuid as $$
declare
  new_list_id uuid;
begin
  insert into public.lists (name, icon, created_by)
  values (list_name, list_icon, auth.uid())
  returning id into new_list_id;

  insert into public.list_members (list_id, user_id)
  values (new_list_id, auth.uid());

  return new_list_id;
end;
$$ language plpgsql security definer;

create or replace function public.share_list_by_email(
  target_list_id uuid,
  target_email text
)
returns boolean as $$
declare
  target_user_id uuid;
begin
  if not exists (
    select 1 from public.list_members
    where list_id = target_list_id and user_id = auth.uid()
  ) then
    raise exception 'Not authorized';
  end if;

  select id into target_user_id
  from public.profiles
  where email = target_email;

  if target_user_id is null then
    raise exception 'User not found';
  end if;

  insert into public.list_members (list_id, user_id)
  values (target_list_id, target_user_id)
  on conflict do nothing;

  return true;
end;
$$ language plpgsql security definer;
