
-- Tour de V2 Supabase schema
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Tour de V2',
  location text not null,
  event_date date not null,
  created_at timestamptz not null default now(),
  unique(location, event_date)
);

create table if not exists public.waves (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  started_at timestamptz,
  created_at timestamptz not null default now(),
  unique(event_id, name)
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  bib text not null,
  category text not null,
  location text not null,
  wave text not null,
  finish_time timestamptz,
  time_expired boolean not null default false,
  routes_completed integer not null default 0,
  scorecard_verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique(event_id, bib)
);

alter table public.events enable row level security;
alter table public.waves enable row level security;
alter table public.participants enable row level security;

drop policy if exists "public read events" on public.events;
drop policy if exists "staff write events" on public.events;
drop policy if exists "public read waves" on public.waves;
drop policy if exists "staff write waves" on public.waves;
drop policy if exists "public read participants" on public.participants;
drop policy if exists "staff write participants" on public.participants;

create policy "public read events"
on public.events for select
using (true);

create policy "staff write events"
on public.events for all
to authenticated
using (true)
with check (true);

create policy "public read waves"
on public.waves for select
using (true);

create policy "staff write waves"
on public.waves for all
to authenticated
using (true)
with check (true);

create policy "public read participants"
on public.participants for select
using (true);

create policy "staff write participants"
on public.participants for all
to authenticated
using (true)
with check (true);

alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.waves;
alter publication supabase_realtime add table public.participants;
