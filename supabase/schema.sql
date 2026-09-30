-- LittlePass San Diego: database schema
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.

-- ============ TABLES ============

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'parent' check (role in ('parent', 'studio')),
  display_name text,
  credits int not null default 10 check (credits >= 0),
  plan text,
  created_at timestamptz not null default now()
);

create table public.kids (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  birthday date not null,
  created_at timestamptz not null default now()
);

create table public.studios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,  -- null = sample partner
  name text not null unique,
  blurb text,
  created_at timestamptz not null default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  title text not null,
  cat text not null check (cat in ('swim','music','gym','art','sensory','yoga','outdoor')),
  hood text not null,
  age_min int not null check (age_min >= 0),
  age_max int not null check (age_max >= age_min),
  credits int not null check (credits between 1 and 10),
  days int[] not null,                 -- 0 = Sunday ... 6 = Saturday
  start_time text not null,            -- e.g. '9:30 AM'
  mins int not null default 45 check (mins between 15 and 180),
  capacity int not null default 8 check (capacity between 1 and 50),
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  session_date date not null,
  credits int not null,
  created_at timestamptz not null default now(),
  unique (user_id, class_id, session_date)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author text not null,
  stars int not null check (stars between 1 and 5),
  body text not null check (char_length(body) <= 1000),
  created_at timestamptz not null default now()
);

-- ============ NEW-USER PROFILE ============
-- Creates a profile row when someone signs up. Role comes from signup metadata.

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    case when new.raw_user_meta_data->>'role' = 'studio' then 'studio' else 'parent' end,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ BOOKING FUNCTIONS (credits can only change here) ============

create function public.book_class(p_class uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.classes; taken int;
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  select * into c from public.classes where id = p_class;
  if not found then raise exception 'Class not found'; end if;
  if not (extract(dow from p_date)::int = any (c.days)) then raise exception 'No class on that day'; end if;
  if p_date < current_date or p_date > current_date + 14 then raise exception 'Date out of range'; end if;
  select count(*) into taken from public.bookings where class_id = p_class and session_date = p_date;
  if taken >= c.capacity then raise exception 'This class is full'; end if;
  update public.profiles set credits = credits - c.credits where id = auth.uid() and credits >= c.credits;
  if not found then raise exception 'Not enough credits'; end if;
  insert into public.bookings (user_id, class_id, session_date, credits)
  values (auth.uid(), p_class, p_date, c.credits);
end $$;

create function public.cancel_booking(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking and user_id = auth.uid();
  if not found then raise exception 'Booking not found'; end if;
  delete from public.bookings where id = b.id;
  update public.profiles set credits = credits + b.credits where id = auth.uid();
end $$;

-- Demo only: adds plan credits without payment. Replace with Stripe before launch.
create function public.demo_choose_plan(p_plan text, p_credits int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  if p_credits not in (12, 25, 45) then raise exception 'Invalid plan'; end if;
  update public.profiles set plan = p_plan, credits = credits + p_credits where id = auth.uid();
end $$;

-- How many spots are taken per class and date (everyone may see counts, not who)
create function public.booked_counts(p_from date, p_to date)
returns table (class_id uuid, session_date date, taken bigint)
language sql security definer set search_path = public stable as $$
  select class_id, session_date, count(*) from public.bookings
  where session_date between p_from and p_to group by 1, 2
$$;

-- ============ ROW LEVEL SECURITY ============

alter table public.profiles enable row level security;
alter table public.kids     enable row level security;
alter table public.studios  enable row level security;
alter table public.classes  enable row level security;
alter table public.bookings enable row level security;
alter table public.reviews  enable row level security;

-- profiles: see and edit only your own; credits/plan/role can't be edited directly
create policy "own profile read"   on public.profiles for select using (id = auth.uid());
create policy "own profile update" on public.profiles for update using (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

-- kids: private to the parent
create policy "own kids" on public.kids for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- studios and classes: public to read, only the owner can write
create policy "studios public read" on public.studios for select using (true);
create policy "studio owner insert" on public.studios for insert
  with check (owner_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role = 'studio'));
create policy "studio owner update" on public.studios for update using (owner_id = auth.uid());
create policy "studio owner delete" on public.studios for delete using (owner_id = auth.uid());

create policy "classes public read" on public.classes for select using (true);
create policy "studio owner adds classes" on public.classes for insert
  with check (exists (select 1 from public.studios s where s.id = studio_id and s.owner_id = auth.uid()));
create policy "studio owner edits classes" on public.classes for update
  using (exists (select 1 from public.studios s where s.id = studio_id and s.owner_id = auth.uid()));
create policy "studio owner removes classes" on public.classes for delete
  using (exists (select 1 from public.studios s where s.id = studio_id and s.owner_id = auth.uid()));

-- bookings: parents see their own; studios see bookings for their own classes; writes go through functions only
create policy "own bookings read" on public.bookings for select using (user_id = auth.uid());
create policy "studio sees its bookings" on public.bookings for select using (
  exists (select 1 from public.classes c join public.studios s on s.id = c.studio_id
          where c.id = class_id and s.owner_id = auth.uid()));

-- reviews: public to read, logged-in users post as themselves
create policy "reviews public read" on public.reviews for select using (true);
create policy "post own review" on public.reviews for insert with check (user_id = auth.uid());
create policy "delete own review" on public.reviews for delete using (user_id = auth.uid());

grant execute on function public.book_class(uuid, date) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.demo_choose_plan(text, int) to authenticated;
grant execute on function public.booked_counts(date, date) to anon, authenticated;

-- ============ SAMPLE PARTNERS (fictional) ============

insert into public.studios (name, blurb) values
 ('Tidepool Swim School', 'Warm, shallow pools and patient instructors who make water fun from the very first splash.'),
 ('Coastal Kids Aquatics', 'Warm, shallow pools and patient instructors who make water fun from the very first splash.'),
 ('Harmony Sprouts Music', 'Songs, rhythm and instruments for tiny hands. Every class ends with a bubble sing-along.'),
 ('Little Notes Studio', 'Songs, rhythm and instruments for tiny hands. Every class ends with a bubble sing-along.'),
 ('Bounce Around Gym', 'Soft mats, low climbers and playful games that help little bodies get strong and confident.'),
 ('Wave Rider Kids Gym', 'Soft mats, low climbers and playful games that help little bodies get strong and confident.'),
 ('Sunny Steps Dance', 'Soft mats, low climbers and playful games that help little bodies get strong and confident.'),
 ('Paint Puddle Art Lab', 'Wash-friendly paints and big messy fun. Smocks provided, masterpieces guaranteed.'),
 ('Little Senses Play Café', 'Gentle lights, textures and sounds designed for curious babies and their grown-ups.'),
 ('Ocean Breath Family Yoga', 'Slow, playful movement and connection for parents and little ones.'),
 ('Canyon Explorers Club', 'Stroller-friendly adventures in San Diego''s parks, canyons and beaches.'),
 ('Sandy Stroll Fitness', 'Stroller-friendly adventures in San Diego''s parks, canyons and beaches.');

insert into public.classes (studio_id, title, cat, hood, age_min, age_max, credits, days, start_time, mins)
select s.id, v.title, v.cat, v.hood, v.age_min, v.age_max, v.credits, v.days, v.start_time, v.mins
from (values
 ('Water Babies Intro','Tidepool Swim School','swim','Pacific Beach',4,18,6,'{1,3,6}'::int[],'9:30 AM',30),
 ('Toddler Splash','Tidepool Swim School','swim','Pacific Beach',18,42,6,'{2,4,6}','10:30 AM',30),
 ('Little Fins','Coastal Kids Aquatics','swim','Carlsbad',12,36,5,'{1,5}','4:00 PM',30),
 ('Baby Beats','Harmony Sprouts Music','music','North Park',0,12,4,'{1,3,5}','10:00 AM',45),
 ('Jam Session Jr.','Harmony Sprouts Music','music','North Park',12,48,4,'{2,4,6}','11:00 AM',45),
 ('Sing & Sign','Little Notes Studio','music','La Jolla',6,24,4,'{2,5}','9:00 AM',40),
 ('Tumble Tots','Bounce Around Gym','gym','Mission Valley',18,36,5,'{1,2,3,4,5}','9:30 AM',45),
 ('Crawlers & Climbers','Bounce Around Gym','gym','Mission Valley',6,18,4,'{1,3,5}','11:00 AM',45),
 ('Mini Ninjas','Wave Rider Kids Gym','gym','Chula Vista',36,60,5,'{2,4,6}','3:30 PM',50),
 ('Wiggle & Dance','Sunny Steps Dance','gym','Hillcrest',24,60,4,'{3,6}','10:00 AM',40),
 ('Messy Masterpieces','Paint Puddle Art Lab','art','Point Loma',12,48,5,'{2,4,6}','10:00 AM',60),
 ('Tiny Picassos','Paint Puddle Art Lab','art','Encinitas',24,60,5,'{1,5}','3:00 PM',60),
 ('Sensory Garden','Little Senses Play Café','sensory','Carmel Valley',0,12,3,'{1,2,3,4,5}','9:00 AM',45),
 ('Bubbles & Lights','Little Senses Play Café','sensory','Carmel Valley',6,24,3,'{2,4,6}','10:30 AM',45),
 ('Baby & Me Yoga','Ocean Breath Family Yoga','yoga','Del Mar',1,12,4,'{1,3,5}','10:00 AM',60),
 ('Toddler Yoga Adventures','Ocean Breath Family Yoga','yoga','Encinitas',24,60,4,'{2,6}','9:30 AM',45),
 ('Balboa Nature Walk','Canyon Explorers Club','outdoor','Hillcrest',12,60,3,'{0,3,6}','9:00 AM',60),
 ('Tidepool Explorers','Canyon Explorers Club','outdoor','La Jolla',30,60,4,'{0,6}','8:30 AM',75),
 ('Stroller Beach Bootcamp','Sandy Stroll Fitness','outdoor','Pacific Beach',2,24,3,'{1,3,5}','8:00 AM',50)
) as v(title, studio, cat, hood, age_min, age_max, credits, days, start_time, mins)
join public.studios s on s.name = v.studio;
