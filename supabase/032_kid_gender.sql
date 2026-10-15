-- Optional gender on a child's profile (parents choose it; it is never required)
alter table public.kids add column if not exists gender text check (gender in ('girl', 'boy', 'other'));
