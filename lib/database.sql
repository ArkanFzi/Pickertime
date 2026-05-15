-- ============================================================
-- Pickertime Database Schema
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- Profiles table (extends auth.users)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  role text default 'Professional',  -- Student, Professional, Freelancer, Creator, etc.
  focus_goal text,                   -- e.g. "Ship product", "Study for finals"
  energy_pref text default 'Morning', -- Morning, Afternoon, Night Owl
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tasks table
create table if not exists public.tasks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  category text default 'General',   -- School, Study, Personal, Work, Health, etc.
  priority text default 'Medium',    -- High, Medium, Low
  start_time timestamptz,
  end_time timestamptz,
  duration_minutes int default 60,
  is_completed boolean default false,
  has_alarm boolean default false,
  alarm_minutes_before int default 10,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Focus sessions table
create table if not exists public.focus_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  task_id uuid references public.tasks(id) on delete set null,
  duration_seconds int not null,
  completed boolean default false,
  timestamp timestamptz default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.focus_sessions enable row level security;

-- Profiles policies
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- Tasks policies
create policy "Users can CRUD own tasks" on public.tasks
  for all using (auth.uid() = user_id);

-- Focus sessions policies
create policy "Users can CRUD own sessions" on public.focus_sessions
  for all using (auth.uid() = user_id);

-- ============================================================
-- Workspace Events (Bridge to OpenClaw)
-- ============================================================
create table if not exists public.workspace_events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  event_type text not null,       -- START_FOCUS, STOP_FOCUS, PAUSE_FOCUS, RESET_FOCUS
  payload jsonb default '{}',     -- Extra info: { task_title: "...", duration: 60 }
  is_processed boolean default false,
  created_at timestamptz default now()
);

alter table public.workspace_events enable row level security;

create policy "Users can CRUD own workspace events" on public.workspace_events
  for all using (auth.uid() = user_id);

-- Trigger: auto-create profile on auth signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
