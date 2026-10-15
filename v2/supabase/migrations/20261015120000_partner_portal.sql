-- Partner portal (phase 5 M4): partner logins, their test credentials, shared
-- integration docs and a private file bucket for game assets and certificates.
-- ---------------------------------------------------------------------------
-- Who can read what:
--   anon               nothing.
--   active partner     its own partners row and credentials; every doc and file.
--   disabled partner   no new reads at all (partners.active = false is checked on
--                      every query); its login is also banned by admin-partners.
--                      A download link it already holds keeps working until it
--                      expires (the portal issues them for 60 s).
--   admin              everything; edits credentials, docs and files. Only the
--                      admin-partners Edge Function (service role) creates partner
--                      logins and switches `active`, so the ban and the flag agree.
-- Public sign-up stays closed. The sign-up gate admits a non-admin email only
-- when the insert carries the one-time secret nonce that admin-partners stored
-- for that email moments before; the gate consumes the nonce and strips it.
-- Additive apart from that gate function, whose admin-email rule is unchanged.

-- ---- tables ---------------------------------------------------------------
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  login_email text not null unique
    check (login_email = lower(login_email) and char_length(login_email) between 3 and 254),
  company text not null check (char_length(company) between 1 and 120),
  contact_email text not null check (char_length(contact_email) between 3 and 254),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table public.partner_credentials (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  sandbox_url text check (sandbox_url is null or (char_length(sandbox_url) <= 500 and sandbox_url ~* '^https://')),
  username text check (username is null or char_length(username) <= 200),
  api_key text check (api_key is null or char_length(api_key) <= 500),
  notes text check (notes is null or char_length(notes) <= 2000),
  updated_at timestamptz not null default now()
);
create index partner_credentials_partner_id_idx on public.partner_credentials(partner_id);

create table public.partner_docs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 50000),
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);

-- One-time sign-up permits, written only by the service role (admin-partners).
create table public.partner_signup_allow (
  email text primary key check (email = lower(email)),
  nonce text not null check (nonce ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null default now() + interval '5 minutes'
);

create trigger partner_credentials_touch before update on public.partner_credentials
  for each row execute function private.touch_updated_at();
create trigger partner_docs_touch before update on public.partner_docs
  for each row execute function private.touch_updated_at();

-- A partner login is never an admin login (so reset/ban never reach an admin).
create or replace function private.partner_is_not_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.admins a where a.user_id = new.user_id) then
    raise exception 'A partner login cannot be an administrator.' using errcode = 'check_violation';
  end if;
  return new;
end; $$;
revoke all on function private.partner_is_not_admin() from public, anon, authenticated;
create trigger partners_not_admin before insert or update of user_id on public.partners
  for each row execute function private.partner_is_not_admin();

-- ---- grants: explicit, nothing inherited ------------------------------------
revoke all on public.partners, public.partner_credentials, public.partner_docs,
  public.partner_signup_allow from public, anon, authenticated;
grant select on public.partners to authenticated;
grant update (company, contact_email) on public.partners to authenticated;
grant select, insert, update, delete on public.partner_credentials, public.partner_docs to authenticated;
grant all on public.partners, public.partner_credentials, public.partner_docs,
  public.partner_signup_allow to service_role;

alter table public.partners enable row level security;
alter table public.partner_credentials enable row level security;
alter table public.partner_docs enable row level security;
alter table public.partner_signup_allow enable row level security;

-- ---- helpers ----------------------------------------------------------------
create or replace function private.current_partner_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.partners p where p.user_id = (select auth.uid()) and p.active;
$$;

create or replace function private.is_active_partner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.partners p where p.user_id = (select auth.uid()) and p.active);
$$;

revoke all on function private.current_partner_id() from public, anon;
revoke all on function private.is_active_partner() from public, anon;
grant execute on function private.current_partner_id() to authenticated, service_role;
grant execute on function private.is_active_partner() to authenticated, service_role;

-- ---- policies ---------------------------------------------------------------
create policy partners_read on public.partners for select to authenticated
  using ((user_id = (select auth.uid()) and active) or (select private.is_admin()));
create policy partners_admin_update on public.partners for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy partner_credentials_read on public.partner_credentials for select to authenticated
  using (partner_id = (select private.current_partner_id()) or (select private.is_admin()));
create policy partner_credentials_admin_insert on public.partner_credentials for insert to authenticated
  with check ((select private.is_admin()));
create policy partner_credentials_admin_update on public.partner_credentials for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy partner_credentials_admin_delete on public.partner_credentials for delete to authenticated
  using ((select private.is_admin()));

create policy partner_docs_read on public.partner_docs for select to authenticated
  using ((select private.is_active_partner()) or (select private.is_admin()));
create policy partner_docs_admin_insert on public.partner_docs for insert to authenticated
  with check ((select private.is_admin()));
create policy partner_docs_admin_update on public.partner_docs for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy partner_docs_admin_delete on public.partner_docs for delete to authenticated
  using ((select private.is_admin()));

-- ---- private bucket: assets/<game>/, certificates/<game>/, docs/ ------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-files', 'partner-files', false, 52428800, array[
  'application/pdf', 'application/zip', 'application/x-zip-compressed',
  'image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'text/plain'
]);

create policy "partner-files read" on storage.objects for select to authenticated
  using (bucket_id = 'partner-files' and ((select private.is_active_partner()) or (select private.is_admin())));
create policy "partner-files admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'partner-files' and (select private.is_admin())
    and (storage.foldername(name))[1] in ('assets', 'certificates', 'docs'));
create policy "partner-files admin update" on storage.objects for update to authenticated
  using (bucket_id = 'partner-files' and (select private.is_admin()))
  with check (bucket_id = 'partner-files' and (select private.is_admin())
    and (storage.foldername(name))[1] in ('assets', 'certificates', 'docs'));
create policy "partner-files admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'partner-files' and (select private.is_admin()));

-- ---- sign-up gate -----------------------------------------------------------
-- Without a partner nonce: exactly the old rule (allow-listed admin emails only).
-- With one: never an admin email; the nonce must match the unexpired permit for
-- this email, which is deleted in the same statement so it works once; the nonce
-- is removed from the stored user metadata.
create or replace function private.enforce_admin_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nonce text := new.raw_user_meta_data ->> 'partner_nonce';
  v_admin_email boolean := exists (
    select 1 from public.admin_emails e where lower(e.email) = lower(new.email));
begin
  if v_nonce is not null then
    if v_admin_email then
      raise exception 'Partner logins cannot use an administrator email.' using errcode = 'check_violation';
    end if;
    delete from public.partner_signup_allow a
      where a.email = lower(new.email) and a.nonce = v_nonce and a.expires_at > now();
    if not found then
      raise exception 'Sign-ups are restricted to authorised administrators.' using errcode = 'check_violation';
    end if;
    new.raw_user_meta_data := new.raw_user_meta_data - 'partner_nonce';
    return new;
  end if;
  if not v_admin_email then
    raise exception 'Sign-ups are restricted to authorised administrators.' using errcode = 'check_violation';
  end if;
  return new;
end; $$;
