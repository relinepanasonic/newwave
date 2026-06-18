-- Add Google Drive photo link column for HRD page
alter table public.profiles add column if not exists gdrive_ktp_url text;
alter table public.profiles add column if not exists phone text;
