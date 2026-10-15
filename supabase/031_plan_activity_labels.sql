-- Plan labels count activities in a range (2-4, 4-8, 8-16) because class prices vary
update public.plans set perks = array['About 2–4 activities a month', 'Free cancellation up to 24h before', 'Unused credits roll over'] where id = 'sprout';
update public.plans set perks = array['About 4–8 activities a month', 'Free cancellation up to 24h before', 'Unused credits roll over'] where id = 'bloom';
update public.plans set perks = array['About 8–16 activities a month', 'Free cancellation up to 24h before', 'Unused credits roll over'] where id = 'grove';
