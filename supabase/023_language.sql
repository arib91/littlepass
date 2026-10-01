-- LittlePass: remember each parent's language (English or Spanish) so their emails match the app
-- Run in Supabase > SQL Editor (after 022). Safe to run again.
alter table public.profiles add column if not exists lang text not null default 'en';
alter table public.profiles drop constraint if exists profiles_lang_check;
alter table public.profiles add constraint profiles_lang_check check (lang in ('en', 'es'));
-- Parents may change their own name and language, nothing else on their profile
revoke update on public.profiles from anon, authenticated;
grant update (display_name, lang) on public.profiles to authenticated;
