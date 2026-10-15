-- Minimal stand-in for the parts of the Supabase project that the partner portal
-- migration and tests/partner_rls.sql touch, so both can run on a throwaway local
-- Postgres before anything is applied to production. Mirrors production as
-- queried on 2026-10-15: role names and RLS bypass, schema USAGE grants (the API
-- roles have none on `private`), table grants, auth.uid(), storage.foldername(),
-- the private helpers and the two auth.users triggers, RLS on storage.buckets
-- with no policies, auth.users.banned_until, and the existing policies
-- on admins, admin_emails and the `uploads` bucket.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
grant anon, authenticated, service_role to postgres;

create schema auth;
create schema storage;
create schema private;
grant usage on schema auth, storage, public to anon, authenticated, service_role;

create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create table auth.users (
  id uuid primary key,
  email text,
  aud text,
  role text,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  banned_until timestamptz,
  created_at timestamptz default now()
);

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table storage.objects enable row level security;
-- Production: RLS on storage.buckets with no policies, so API roles cannot change a bucket.
alter table storage.buckets enable row level security;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;

create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1 : array_length(_parts, 1) - 1];
end
$$;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create table public.admin_emails (email text primary key);
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz default now()
);
alter table public.admin_emails enable row level security;
alter table public.admins enable row level security;

create function private.is_admin() returns boolean language sql stable security definer
  set search_path to 'public' as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
create function private.touch_updated_at() returns trigger language plpgsql
  set search_path to 'public' as $$
begin new.updated_at = now(); return new; end; $$;
create function private.handle_new_user() returns trigger language plpgsql security definer
  set search_path to 'public' as $$
begin
  if exists (select 1 from public.admin_emails where lower(email) = lower(new.email)) then
    insert into public.admins(user_id, email) values (new.id, new.email)
    on conflict (user_id) do nothing;
  end if;
  return new;
end; $$;
create function private.enforce_admin_signup() returns trigger language plpgsql security definer
  set search_path to 'public' as $$
begin
  if not exists (select 1 from public.admin_emails where lower(email) = lower(new.email)) then
    raise exception 'Sign-ups are restricted to authorised administrators.'
      using errcode = 'check_violation';
  end if;
  return new;
end; $$;
revoke all on function private.handle_new_user() from public;
revoke all on function private.enforce_admin_signup() from public;

create trigger enforce_admin_signup before insert on auth.users
  for each row execute function private.enforce_admin_signup();
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create policy admin_emails_read on public.admin_emails for select using (private.is_admin());
create policy admins_read on public.admins for select
  using ((user_id = (select auth.uid())) or private.is_admin());

insert into storage.buckets (id, name, public) values ('uploads', 'uploads', true);
create policy "uploads public read" on storage.objects for select using (bucket_id = 'uploads');
create policy "uploads admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and private.is_admin());
create policy "uploads admin update" on storage.objects for update to authenticated
  using (bucket_id = 'uploads' and private.is_admin()) with check (bucket_id = 'uploads' and private.is_admin());
create policy "uploads admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and private.is_admin());
