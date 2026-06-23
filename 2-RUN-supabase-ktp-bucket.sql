-- ============================================================
-- Run this in Supabase SQL Editor.
-- Fixes "Bucket not found" when viewing KTP photos in HRD.
-- The app stores KTP as a PUBLIC url (getPublicUrl), so the
-- bucket must exist AND be public.
-- ============================================================

-- Create the bucket if missing, and force it public either way
insert into storage.buckets (id, name, public)
values ('ktp-photos', 'ktp-photos', true)
on conflict (id) do update set public = true;

-- Allow public read of objects in this bucket (so the "Lihat" link opens)
drop policy if exists "public read ktp" on storage.objects;
create policy "public read ktp"
  on storage.objects for select
  using (bucket_id = 'ktp-photos');
