-- LittlePass: email notifications
-- The database tells the send-email Edge Function when something happens (new studio, approval, booking, report).
-- Run in Supabase > SQL Editor (after 012). Safe to run again.

create extension if not exists pg_net with schema extensions;

-- Where to send events, and a shared secret so only the database can trigger emails
create table if not exists public.email_settings (
  id int primary key default 1 check (id = 1),
  function_url text,
  hook_secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
alter table public.email_settings enable row level security;   -- no policies: not readable from the app

insert into public.email_settings (id, function_url)
values (1, 'https://nktwkktslnvredjkqzjq.supabase.co/functions/v1/send-email')
on conflict (id) do nothing;

-- Sends an event to the Edge Function. Never blocks the real action if email fails.
create or replace function public.send_email_event(p_event text, p_data jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s public.email_settings;
begin
  select * into s from public.email_settings where id = 1;
  if s.function_url is null then return; end if;
  perform net.http_post(
    url := s.function_url,
    body := jsonb_build_object('event', p_event, 'data', p_data),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', s.hook_secret));
exception when others then
  null;
end $$;
revoke execute on function public.send_email_event(text, jsonb) from public, anon, authenticated;

-- ===== Triggers =====
create or replace function public.trg_studio_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.send_email_event('studio_signup', jsonb_build_object('studio_id', new.id));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.owner_id is not null then
    perform public.send_email_event('studio_status', jsonb_build_object('studio_id', new.id));
  end if;
  return null;
end $$;
drop trigger if exists studio_email on public.studios;
create trigger studio_email after insert or update of status on public.studios
  for each row execute function public.trg_studio_email();

create or replace function public.trg_booking_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.send_email_event('booking_created', jsonb_build_object('booking_id', new.id));
  return null;
end $$;
drop trigger if exists booking_email on public.bookings;
create trigger booking_email after insert on public.bookings
  for each row execute function public.trg_booking_email();

create or replace function public.trg_report_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.send_email_event('report_created', jsonb_build_object('report_id', new.id));
  return null;
end $$;
drop trigger if exists report_email on public.reports;
create trigger report_email after insert on public.reports
  for each row execute function public.trg_report_email();
