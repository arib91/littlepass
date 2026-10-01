-- Links each plan to its Stripe (TEST mode) price. Replace with live-mode price IDs before real launch.
update public.plans set stripe_price_id = 'price_1ULbVAHFxiZ6nO7KAomzoURs' where id = 'sprout';
update public.plans set stripe_price_id = 'price_1ULbVNHFxiZ6nO7KWijVPyt0' where id = 'bloom';
update public.plans set stripe_price_id = 'price_1ULbVXHFxiZ6nO7KWNqXyt3J' where id = 'grove';
