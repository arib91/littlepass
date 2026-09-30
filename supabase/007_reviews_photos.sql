-- LittlePass: verified reviews, studio replies, photos, reporting
-- Run in Supabase > SQL Editor (after 006). Safe to run again.

-- ========== 1. REVIEWS: verified, per class, with ratings ==========
-- Old test reviews were not tied to an attended class, so they are removed.
alter table public.reviews add column if not exists class_id uuid references public.classes(id) on delete set null;
delete from public.reviews where class_id is null;
alter table public.reviews
  add column if not exists class_title text,
  add column if not exists instructor_stars int check (instructor_stars between 1 and 5),
  add column if not exists clean_stars int check (clean_stars between 1 and 5),
  add column if not exists value_stars int check (value_stars between 1 and 5),
  add column if not exists hidden boolean not null default false,
  add column if not exists reply text check (char_length(reply) <= 500),
  add column if not exists reply_at timestamptz;
create unique index if not exists reviews_one_per_class on public.reviews (user_id, class_id);

-- Nobody writes reviews directly: only through post_review(), which checks attendance
drop policy if exists "post own review" on public.reviews;
drop policy if exists "reviews public read" on public.reviews;
create policy "reviews read" on public.reviews for select using (not hidden or public.is_admin());
drop policy if exists "admin updates reviews" on public.reviews;
create policy "admin updates reviews" on public.reviews for update using (public.is_admin()) with check (public.is_admin());

create or replace function public.post_review(p_class uuid, p_stars int, p_instructor int, p_clean int, p_value int, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare pr public.profiles; c public.classes; nm text; txt text;
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  select * into pr from public.profiles where id = auth.uid();
  if pr.role <> 'parent' then raise exception 'Only parents can write reviews'; end if;
  select * into c from public.classes where id = p_class;
  if not found then raise exception 'Class not found'; end if;
  if not exists (select 1 from public.bookings
                 where user_id = auth.uid() and class_id = p_class and session_date < public.la_today()) then
    raise exception 'You can review a class after you have attended it';
  end if;
  if p_stars not between 1 and 5 or p_instructor not between 1 and 5
     or p_clean not between 1 and 5 or p_value not between 1 and 5 then
    raise exception 'Ratings must be between 1 and 5';
  end if;
  txt := trim(coalesce(p_body, ''));
  if char_length(txt) < 5 then raise exception 'Please write a few words about the class'; end if;
  if char_length(txt) > 1000 then raise exception 'Please keep your review under 1000 characters'; end if;
  nm := coalesce(nullif(trim(pr.display_name), ''), 'Parent');
  if nm ~ '\s' then nm := regexp_replace(nm, '^(\S+)\s+(?:.*\s)?(\S)\S*$', '\1 \2.'); end if;
  insert into public.reviews (studio_id, user_id, class_id, class_title, author, stars, instructor_stars, clean_stars, value_stars, body)
  values (c.studio_id, auth.uid(), p_class, c.title, nm, p_stars, p_instructor, p_clean, p_value, txt)
  on conflict (user_id, class_id) do update set
    stars = excluded.stars, instructor_stars = excluded.instructor_stars, clean_stars = excluded.clean_stars,
    value_stars = excluded.value_stars, body = excluded.body, author = excluded.author, class_title = excluded.class_title;
end $$;

-- Studios can reply once per review (and edit or clear their reply). They can't edit or delete reviews.
create or replace function public.reply_to_review(p_review uuid, p_reply text) returns void
language plpgsql security definer set search_path = public as $$
declare txt text := nullif(trim(coalesce(p_reply, '')), '');
begin
  if not exists (select 1 from public.reviews r join public.studios s on s.id = r.studio_id
                 where r.id = p_review and s.owner_id = auth.uid()) then
    raise exception 'Not allowed';
  end if;
  update public.reviews set reply = left(txt, 500), reply_at = case when txt is null then null else now() end
  where id = p_review;
end $$;

-- ========== 2. REPORTS ==========
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('review', 'photo')),
  target_id uuid not null,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text check (char_length(reason) <= 300),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (reporter_id, kind, target_id)
);
alter table public.reports enable row level security;
drop policy if exists "admin reads reports" on public.reports;
create policy "admin reads reports" on public.reports for select using (public.is_admin());
drop policy if exists "admin updates reports" on public.reports;
create policy "admin updates reports" on public.reports for update using (public.is_admin()) with check (public.is_admin());

create or replace function public.report_content(p_kind text, p_target uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please log in to report'; end if;
  if p_kind not in ('review', 'photo') then raise exception 'Invalid report'; end if;
  insert into public.reports (kind, target_id, reporter_id, reason)
  values (p_kind, p_target, auth.uid(), left(nullif(trim(coalesce(p_reason, '')), ''), 300))
  on conflict (reporter_id, kind, target_id) do nothing;
end $$;

-- ========== 3. PHOTOS ==========
create table if not exists public.studio_photos (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  path text not null,
  caption text check (char_length(caption) <= 120),
  consent boolean not null check (consent),   -- studio confirmed permission from parents of any children shown
  created_at timestamptz not null default now()
);
alter table public.studio_photos enable row level security;

drop policy if exists "photos read" on public.studio_photos;
create policy "photos read" on public.studio_photos for select using (
  public.is_admin() or exists (select 1 from public.studios s
    where s.id = studio_id and (s.status = 'approved' or s.owner_id = auth.uid())));
drop policy if exists "photos owner insert" on public.studio_photos;
create policy "photos owner insert" on public.studio_photos for insert with check (
  path like studio_id::text || '/%'
  and exists (select 1 from public.studios s where s.id = studio_id and s.owner_id = auth.uid()));
drop policy if exists "photos owner or admin delete" on public.studio_photos;
create policy "photos owner or admin delete" on public.studio_photos for delete using (
  public.is_admin() or exists (select 1 from public.studios s where s.id = studio_id and s.owner_id = auth.uid()));

create or replace function public.limit_studio_photos() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.studio_photos where studio_id = new.studio_id) >= 24 then
    raise exception 'You can upload up to 24 photos. Delete one to add another.';
  end if;
  return new;
end $$;
drop trigger if exists studio_photos_limit on public.studio_photos;
create trigger studio_photos_limit before insert on public.studio_photos
  for each row execute function public.limit_studio_photos();

-- File storage: a public bucket (anyone can view), only the studio can upload into its own folder
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio-photos', 'studio-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "studio uploads photos" on storage.objects;
create policy "studio uploads photos" on storage.objects for insert to authenticated with check (
  bucket_id = 'studio-photos' and exists (select 1 from public.studios s
    where s.owner_id = auth.uid() and s.id::text = (storage.foldername(name))[1]));
drop policy if exists "studio or admin deletes photos" on storage.objects;
create policy "studio or admin deletes photos" on storage.objects for delete to authenticated using (
  bucket_id = 'studio-photos' and (public.is_admin() or exists (select 1 from public.studios s
    where s.owner_id = auth.uid() and s.id::text = (storage.foldername(name))[1])));

revoke execute on function public.post_review(uuid, int, int, int, int, text) from public, anon;
revoke execute on function public.reply_to_review(uuid, text) from public, anon;
revoke execute on function public.report_content(text, uuid, text) from public, anon;
grant execute on function public.post_review(uuid, int, int, int, int, text) to authenticated;
grant execute on function public.reply_to_review(uuid, text) to authenticated;
grant execute on function public.report_content(text, uuid, text) to authenticated;
