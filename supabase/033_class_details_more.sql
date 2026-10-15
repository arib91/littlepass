-- Richer class pages: first-visit tips, instructor, and a class photo (one of the studio's own photos)
alter table public.classes
  add column if not exists first_visit text check (char_length(first_visit) <= 300),
  add column if not exists instructor text check (char_length(instructor) <= 80),
  add column if not exists instructor_bio text check (char_length(instructor_bio) <= 300),
  add column if not exists photo_id uuid references public.studio_photos(id) on delete set null;
