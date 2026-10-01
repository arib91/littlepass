-- LittlePass: class addresses with per-class privacy
-- 'public'  = anyone can see the address and exact map pin
-- 'booked'  = only the studio, admins and parents who booked that class can see it
-- Run in Supabase > SQL Editor. Safe to run again.

create table if not exists public.class_locations (
  class_id uuid primary key references public.classes(id) on delete cascade,
  address text not null check (char_length(address) between 5 and 200),
  lat double precision,
  lng double precision,
  visibility text not null default 'booked' check (visibility in ('public', 'booked')),
  updated_at timestamptz not null default now()
);
alter table public.class_locations enable row level security;

-- Public flag so the app can say "address shared after you book" without revealing the address
alter table public.classes add column if not exists has_address boolean not null default false;

create or replace function public.sync_has_address() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    update public.classes set has_address = false where id = old.class_id;
  else
    update public.classes set has_address = true where id = new.class_id;
  end if;
  return null;
end $$;
drop trigger if exists class_locations_flag on public.class_locations;
create trigger class_locations_flag after insert or update or delete on public.class_locations
  for each row execute function public.sync_has_address();

drop policy if exists "locations read" on public.class_locations;
create policy "locations read" on public.class_locations for select using (
  public.is_admin()
  or exists (select 1 from public.classes c join public.studios s on s.id = c.studio_id
             where c.id = class_locations.class_id and s.owner_id = auth.uid())
  or (class_locations.visibility = 'public' and exists (select 1 from public.classes c join public.studios s on s.id = c.studio_id
             where c.id = class_locations.class_id and s.status = 'approved'))
  or exists (select 1 from public.bookings b
             where b.class_id = class_locations.class_id and b.user_id = auth.uid()));

drop policy if exists "locations owner insert" on public.class_locations;
create policy "locations owner insert" on public.class_locations for insert with check (
  exists (select 1 from public.classes c join public.studios s on s.id = c.studio_id
          where c.id = class_locations.class_id and s.owner_id = auth.uid()));
drop policy if exists "locations owner update" on public.class_locations;
create policy "locations owner update" on public.class_locations for update using (
  exists (select 1 from public.classes c join public.studios s on s.id = c.studio_id
          where c.id = class_locations.class_id and s.owner_id = auth.uid()))
  with check (
  exists (select 1 from public.classes c join public.studios s on s.id = c.studio_id
          where c.id = class_locations.class_id and s.owner_id = auth.uid()));
drop policy if exists "locations owner delete" on public.class_locations;
create policy "locations owner delete" on public.class_locations for delete using (
  exists (select 1 from public.classes c join public.studios s on s.id = c.studio_id
          where c.id = class_locations.class_id and s.owner_id = auth.uid()));
