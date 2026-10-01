-- LittlePass: record which version of the Terms each person accepted at signup
-- Run in Supabase > SQL Editor (after 013). Safe to run again.

alter table public.profiles
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, display_name, terms_version, terms_accepted_at)
  values (
    new.id,
    case when new.raw_user_meta_data->>'role' = 'studio' then 'studio' else 'parent' end,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'terms_version',
    nullif(new.raw_user_meta_data->>'terms_accepted_at', '')::timestamptz
  );
  return new;
end $$;
