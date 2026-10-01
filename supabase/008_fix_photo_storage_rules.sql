-- Fix: the storage rules read "name" as the studio's name instead of the file's name.
-- Run in Supabase > SQL Editor. Safe to run again.

drop policy if exists "studio uploads photos" on storage.objects;
create policy "studio uploads photos" on storage.objects for insert to authenticated with check (
  bucket_id = 'studio-photos' and exists (select 1 from public.studios s
    where s.owner_id = auth.uid() and s.id::text = (storage.foldername(objects.name))[1]));

drop policy if exists "studio or admin deletes photos" on storage.objects;
create policy "studio or admin deletes photos" on storage.objects for delete to authenticated using (
  bucket_id = 'studio-photos' and (public.is_admin() or exists (select 1 from public.studios s
    where s.owner_id = auth.uid() and s.id::text = (storage.foldername(objects.name))[1])));
