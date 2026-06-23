-- Google Drive integration: store each host's Drive folder link.
-- gdrive_ktp_url already exists (KTP file link); this adds the folder link.
-- Safe to run multiple times.

alter table public.profiles
  add column if not exists gdrive_folder_url text;

comment on column public.profiles.gdrive_folder_url is
  'Link to the host''s personal folder inside the New Wave HRD Google Drive folder.';
