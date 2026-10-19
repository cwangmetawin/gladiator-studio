-- Phase 6 (2026-10-20): database hygiene from the phase 5 backlog. The owner runs this in the Supabase
-- dashboard's SQL editor; no session changes the production database.
--
-- 1. Legacy grants. These tables were created under Supabase's default privileges, which grant ALL to
--    the API roles. Row-level security gates SELECT/INSERT/UPDATE/DELETE, but not TRUNCATE, and no API
--    role needs TRUNCATE, TRIGGER or REFERENCES. No HTTP route can issue them today, so this closes a
--    latent gap only. The partner tables already revoke everything (20261015120000). storage.objects and
--    storage.buckets carry the same grants but belong to Supabase's storage service, so they stay as
--    they are.
revoke truncate, trigger, references
  on public.admins, public.admin_emails, public.enquiries, public.games, public.site_content
  from anon, authenticated;

-- 2. The foreign key partners.created_by -> auth.users(id) had no index (Supabase advisor, INFO). A user
--    deletion's ON DELETE SET NULL then scans partners; the table is tiny, so this is housekeeping.
create index if not exists partners_created_by_idx on public.partners (created_by);
