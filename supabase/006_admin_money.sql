-- LittlePass: admin payouts + pricing screens
-- Run ONCE in Supabase > SQL Editor (after 005).

-- Admin can read all payouts
create policy "admin reads payouts" on public.payouts for select using (public.is_admin());

-- Per-studio money summary (all amounts in cents)
create function public.admin_payout_summary()
returns table (studio_id uuid, studio_name text, owner_email text, earned_cents bigint, paid_cents bigint,
               pending_cents bigint, ready_cents bigint, ready_count bigint, upcoming_cents bigint)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, u.email::text,
    coalesce(sum(b.price_cents) filter (where b.session_date < public.la_today()), 0),
    coalesce(sum(b.price_cents) filter (where p.status = 'paid'), 0),
    coalesce(sum(b.price_cents) filter (where p.status = 'pending'), 0),
    coalesce(sum(b.price_cents) filter (where b.session_date < public.la_today() and b.payout_id is null), 0),
    count(b.id) filter (where b.session_date < public.la_today() and b.payout_id is null),
    coalesce(sum(b.price_cents) filter (where b.session_date >= public.la_today()), 0)
  from public.studios s
  left join auth.users u on u.id = s.owner_id
  left join public.bookings b on b.studio_id = s.id
  left join public.payouts p on p.id = b.payout_id
  where public.is_admin()
  group by s.id, s.name, u.email
  order by 7 desc, s.name
$$;

create function public.admin_create_payout(p_studio uuid, p_through date) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  return public.create_payout(p_studio, p_through);
end $$;

create function public.admin_mark_payout_paid(p_payout uuid, p_reference text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  perform public.mark_payout_paid(p_payout, p_reference);
end $$;

-- Pricing + cancellation settings
create function public.admin_get_pricing()
returns table (credit_value_cents int, margin_pct numeric, max_credits int, cancel_hours int)
language sql stable security definer set search_path = public as $$
  select s.credit_value_cents, s.margin_pct, s.max_credits, s.cancel_hours
  from public.pricing_settings s where s.id = 1 and public.is_admin()
$$;

create function public.admin_set_pricing(p_credit_value_cents int, p_margin_pct numeric, p_max_credits int, p_cancel_hours int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if p_credit_value_cents < 50 or p_credit_value_cents > 2000 then raise exception 'Credit value must be between $0.50 and $20.00'; end if;
  if p_margin_pct < 0 or p_margin_pct > 80 then raise exception 'Margin must be between 0% and 80%'; end if;
  if p_max_credits < 1 or p_max_credits > 100 then raise exception 'Max credits must be between 1 and 100'; end if;
  if p_cancel_hours < 0 or p_cancel_hours > 168 then raise exception 'Cancellation window must be between 0 and 168 hours'; end if;
  update public.pricing_settings set credit_value_cents = p_credit_value_cents, margin_pct = p_margin_pct,
    max_credits = p_max_credits, cancel_hours = p_cancel_hours where id = 1;  -- also recalculates every slot
end $$;

revoke execute on function public.admin_payout_summary() from public, anon;
revoke execute on function public.admin_create_payout(uuid, date) from public, anon;
revoke execute on function public.admin_mark_payout_paid(uuid, text) from public, anon;
revoke execute on function public.admin_get_pricing() from public, anon;
revoke execute on function public.admin_set_pricing(int, numeric, int, int) from public, anon;
grant execute on function public.admin_payout_summary() to authenticated;
grant execute on function public.admin_create_payout(uuid, date) to authenticated;
grant execute on function public.admin_mark_payout_paid(uuid, text) to authenticated;
grant execute on function public.admin_get_pricing() to authenticated;
grant execute on function public.admin_set_pricing(int, numeric, int, int) to authenticated;
