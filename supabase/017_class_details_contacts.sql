-- LittlePass: class details (public) and studio contact info (only for parents who booked)
-- Run in Supabase > SQL Editor (after 016). Safe to run again.

-- ========== 1. Class details everyone can see ==========
alter table public.classes
  add column if not exists description text check (char_length(description) <= 600),
  add column if not exists what_to_bring text check (char_length(what_to_bring) <= 200),
  add column if not exists focus text check (char_length(focus) <= 120),
  add column if not exists parent_stays text not null default 'stays' check (parent_stays in ('stays', 'dropoff', 'either')),
  add column if not exists level text not null default 'all' check (level in ('beginner', 'all', 'advanced'));

-- ========== 2. Studio contact info: only the studio, admins, and parents who have booked there ==========
create table if not exists public.studio_contacts (
  studio_id uuid primary key references public.studios(id) on delete cascade,
  phone text check (char_length(phone) <= 30),
  website text check (char_length(website) <= 200),
  arrival_notes text check (char_length(arrival_notes) <= 300),
  updated_at timestamptz not null default now()
);
alter table public.studio_contacts enable row level security;

drop policy if exists "contacts read" on public.studio_contacts;
create policy "contacts read" on public.studio_contacts for select using (
  public.is_admin()
  or exists (select 1 from public.studios s where s.id = studio_contacts.studio_id and s.owner_id = auth.uid())
  or exists (select 1 from public.bookings b where b.studio_id = studio_contacts.studio_id and b.user_id = auth.uid()));

drop policy if exists "contacts owner insert" on public.studio_contacts;
create policy "contacts owner insert" on public.studio_contacts for insert with check (
  exists (select 1 from public.studios s where s.id = studio_contacts.studio_id and s.owner_id = auth.uid()));
drop policy if exists "contacts owner update" on public.studio_contacts;
create policy "contacts owner update" on public.studio_contacts for update using (
  exists (select 1 from public.studios s where s.id = studio_contacts.studio_id and s.owner_id = auth.uid()))
  with check (
  exists (select 1 from public.studios s where s.id = studio_contacts.studio_id and s.owner_id = auth.uid()));
drop policy if exists "contacts owner delete" on public.studio_contacts;
create policy "contacts owner delete" on public.studio_contacts for delete using (
  exists (select 1 from public.studios s where s.id = studio_contacts.studio_id and s.owner_id = auth.uid()));
