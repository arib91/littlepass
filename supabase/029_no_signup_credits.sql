-- LittlePass: new accounts no longer start with 10 free credits.
-- Credits now come only from a paid plan, whose first month is half price. People who already have an account keep their balance.
-- Run in Supabase > SQL Editor (after 028). Safe to run again.
alter table public.profiles alter column credits set default 0;
