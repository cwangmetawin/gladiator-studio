-- Row Level Security and sign-up gate tests for the partner portal (phase 5 M4).
-- ---------------------------------------------------------------------------
-- ALWAYS rolls back: the block ends by raising an exception whose message carries
-- the results, so none of the users, partners, credentials, docs or storage rows
-- it creates survive. Every assertion is scoped to the fixtures it creates, so it
-- holds on a database that already has real partner content.
-- Run locally first: `sh supabase/tests/local/run-rls.sh` (throwaway Postgres).
-- Every value in the PARTNER_RLS_RESULT json must be true.
do $$
declare
  r jsonb := '{}'::jsonb;
  admin_id uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid();
  p2 uuid := gen_random_uuid();
  p3 uuid := gen_random_uuid();
  u4 uuid := gen_random_uuid();
  pr1 uuid;
  pr2 uuid;
  pr3 uuid;
  d1 uuid;
  d2 uuid;
  n int;
  t text;
  nonce_x text := md5(random()::text) || md5(random()::text);
  fixture_files text[] := array['assets/rls-test-fixture/pack.zip', 'certificates/rls-test-fixture/cert.pdf'];
begin
  -- ---- setup (as postgres, like the function's service role) ---------------
  insert into public.admin_emails(email) values ('rls-admin@test.invalid');
  insert into auth.users(id, email, aud, role) values (admin_id, 'rls-admin@test.invalid', 'authenticated', 'authenticated');
  -- partner logins go through the nonce path exactly as admin-partners does
  insert into public.partner_signup_allow(email, nonce)
  select e, md5(e || 'n1') || md5(e || 'n2') from unnest(array[
    'rls-p1@test.invalid', 'rls-p2@test.invalid', 'rls-p3@test.invalid', 'rls-u4@test.invalid']) e;
  insert into auth.users(id, email, aud, role, raw_user_meta_data)
  select id, e, 'authenticated', 'authenticated', jsonb_build_object('partner_nonce', md5(e || 'n1') || md5(e || 'n2'))
  from (values (p1, 'rls-p1@test.invalid'), (p2, 'rls-p2@test.invalid'),
               (p3, 'rls-p3@test.invalid'), (u4, 'rls-u4@test.invalid')) v(id, e);
  insert into public.partners(user_id, login_email, company, contact_email) values (p1, 'rls-p1@test.invalid', 'P1 Co', 'rls-p1@test.invalid') returning id into pr1;
  insert into public.partners(user_id, login_email, company, contact_email) values (p2, 'rls-p2@test.invalid', 'P2 Co', 'rls-p2@test.invalid') returning id into pr2;
  insert into public.partners(user_id, login_email, company, contact_email, active) values (p3, 'rls-p3@test.invalid', 'P3 Co', 'rls-p3@test.invalid', false) returning id into pr3;
  insert into public.partner_credentials(partner_id, label, api_key) values
    (pr1, 'P1 sandbox', 'KEY-P1-RLSFIX'), (pr2, 'P2 sandbox', 'KEY-P2-RLSFIX'), (pr3, 'P3 sandbox', 'KEY-P3-RLSFIX');
  insert into public.partner_docs(title, body) values ('RLS fixture doc A', 'a') returning id into d1;
  insert into public.partner_docs(title, body) values ('RLS fixture doc B', 'b') returning id into d2;
  insert into storage.objects(bucket_id, name) select 'partner-files', f from unnest(fixture_files) f;

  -- ---- the sign-up gate -----------------------------------------------------
  select count(*) into n from public.admins where user_id = admin_id;
  r := r || jsonb_build_object('admin_email_signup_still_works', n = 1);
  select count(*) into n from public.admins where user_id in (p1, p2, p3, u4);
  r := r || jsonb_build_object('partners_are_not_admins', n = 0);
  select count(*) into n from auth.users where id in (p1, p2, p3, u4) and raw_user_meta_data ? 'partner_nonce';
  r := r || jsonb_build_object('nonce_stripped_from_metadata', n = 0);
  select count(*) into n from public.partner_signup_allow where email like 'rls-%@test.invalid';
  r := r || jsonb_build_object('nonce_consumed_on_use', n = 0);
  begin
    insert into auth.users(id, email, aud, role) values (gen_random_uuid(), 'rls-stranger@test.invalid', 'authenticated', 'authenticated');
    r := r || jsonb_build_object('signup_stranger_blocked', false);
  exception when check_violation then
    r := r || jsonb_build_object('signup_stranger_blocked', true);
  end;
  insert into public.partner_signup_allow(email, nonce) values ('rls-x@test.invalid', nonce_x);
  begin
    insert into auth.users(id, email, aud, role, raw_user_meta_data) values (gen_random_uuid(), 'rls-x@test.invalid', 'authenticated', 'authenticated', '{}'::jsonb);
    r := r || jsonb_build_object('signup_permit_without_nonce_blocked', false);
  exception when check_violation then
    r := r || jsonb_build_object('signup_permit_without_nonce_blocked', true);
  end;
  begin
    insert into auth.users(id, email, aud, role, raw_user_meta_data) values (gen_random_uuid(), 'rls-x@test.invalid', 'authenticated', 'authenticated',
      jsonb_build_object('partner_nonce', repeat('0', 64)));
    r := r || jsonb_build_object('signup_guessed_nonce_blocked', false);
  exception when check_violation then
    r := r || jsonb_build_object('signup_guessed_nonce_blocked', true);
  end;
  begin
    insert into auth.users(id, email, aud, role, raw_user_meta_data) values (gen_random_uuid(), 'rls-y@test.invalid', 'authenticated', 'authenticated',
      jsonb_build_object('partner_nonce', nonce_x));
    r := r || jsonb_build_object('signup_nonce_bound_to_email', false);
  exception when check_violation then
    r := r || jsonb_build_object('signup_nonce_bound_to_email', true);
  end;
  update public.partner_signup_allow set expires_at = now() - interval '1 second' where email = 'rls-x@test.invalid';
  begin
    insert into auth.users(id, email, aud, role, raw_user_meta_data) values (gen_random_uuid(), 'rls-x@test.invalid', 'authenticated', 'authenticated',
      jsonb_build_object('partner_nonce', nonce_x));
    r := r || jsonb_build_object('signup_expired_permit_blocked', false);
  exception when check_violation then
    r := r || jsonb_build_object('signup_expired_permit_blocked', true);
  end;
  insert into public.admin_emails(email) values ('rls-admin2@test.invalid');
  insert into public.partner_signup_allow(email, nonce) values ('rls-admin2@test.invalid', nonce_x);
  begin
    insert into auth.users(id, email, aud, role, raw_user_meta_data) values (gen_random_uuid(), 'RLS-Admin2@test.invalid', 'authenticated', 'authenticated',
      jsonb_build_object('partner_nonce', nonce_x));
    r := r || jsonb_build_object('partner_permit_cannot_create_admin', false);
  exception when check_violation then
    r := r || jsonb_build_object('partner_permit_cannot_create_admin', true);
  end;
  begin
    insert into public.partners(user_id, login_email, company, contact_email) values (admin_id, 'rls-admin@test.invalid', 'Admin Co', 'rls-admin@test.invalid');
    r := r || jsonb_build_object('partner_row_cannot_point_at_admin', false);
  exception when check_violation then
    r := r || jsonb_build_object('partner_row_cannot_point_at_admin', true);
  end;

  -- ---- anon sees nothing ---------------------------------------------------
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  foreach t in array array['partners', 'partner_credentials', 'partner_docs', 'partner_signup_allow'] loop
    begin
      execute format('select count(*) from public.%I', t) into n;
      r := r || jsonb_build_object('anon_' || t, false);
    exception when insufficient_privilege then
      r := r || jsonb_build_object('anon_' || t, true);
    end;
  end loop;
  select count(*) into n from storage.objects where bucket_id = 'partner-files';
  r := r || jsonb_build_object('anon_files', n = 0);
  execute 'reset role';

  -- ---- active partner p1: own rows, shared docs and files ------------------
  perform set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.partners where id in (pr1, pr2, pr3);
  r := r || jsonb_build_object('p1_sees_only_own_partner_row', n = 1 and exists (select 1 from public.partners where id = pr1));
  select count(*) into n from public.partner_credentials where api_key like '%-RLSFIX';
  r := r || jsonb_build_object('p1_sees_only_own_credentials', n = 1 and exists (select 1 from public.partner_credentials where api_key = 'KEY-P1-RLSFIX'));
  select count(*) into n from public.partner_docs where id in (d1, d2);
  r := r || jsonb_build_object('p1_sees_docs', n = 2);
  select count(*) into n from storage.objects where bucket_id = 'partner-files' and name = any(fixture_files);
  r := r || jsonb_build_object('p1_sees_files', n = 2);
  update public.partner_credentials set api_key = 'HACKED' where partner_id = pr1;
  get diagnostics n = row_count;
  r := r || jsonb_build_object('p1_cannot_edit_own_credentials', n = 0);
  begin
    insert into public.partner_credentials(partner_id, label) values (pr1, 'forged');
    r := r || jsonb_build_object('p1_cannot_add_credentials', false);
  exception when insufficient_privilege then
    r := r || jsonb_build_object('p1_cannot_add_credentials', true);
  end;
  update public.partners set company = 'Renamed' where id = pr1;
  get diagnostics n = row_count;
  r := r || jsonb_build_object('p1_cannot_edit_partner_row', n = 0);
  begin
    update public.partners set active = true where id = pr3;
    r := r || jsonb_build_object('p1_cannot_toggle_active', false);
  exception when insufficient_privilege then
    r := r || jsonb_build_object('p1_cannot_toggle_active', true);
  end;
  begin
    update public.partners set user_id = p1 where id = pr2;
    r := r || jsonb_build_object('p1_cannot_take_other_partner', false);
  exception when insufficient_privilege then
    r := r || jsonb_build_object('p1_cannot_take_other_partner', true);
  end;
  begin
    -- u4 has a login but no partners row, so only authorisation can stop this
    insert into public.partners(user_id, login_email, company, contact_email) values (u4, 'rls-u4@test.invalid', 'Forged', 'rls-u4@test.invalid');
    r := r || jsonb_build_object('p1_cannot_insert_partner', false);
  exception when insufficient_privilege then
    r := r || jsonb_build_object('p1_cannot_insert_partner', true);
  end;
  update public.partner_docs set body = 'HACKED' where id in (d1, d2);
  get diagnostics n = row_count;
  r := r || jsonb_build_object('p1_cannot_edit_docs', n = 0);
  begin
    insert into storage.objects(bucket_id, name) values ('partner-files', 'assets/rls-test-fixture/evil.zip');
    r := r || jsonb_build_object('p1_cannot_upload', false);
  exception when insufficient_privilege then
    r := r || jsonb_build_object('p1_cannot_upload', true);
  end;
  begin
    execute 'select count(*) from public.partner_signup_allow' into n;
    r := r || jsonb_build_object('p1_cannot_read_signup_allow', false);
  exception when insufficient_privilege then
    r := r || jsonb_build_object('p1_cannot_read_signup_allow', true);
  end;
  execute 'reset role';

  -- ---- disabled partner p3 and a plain signed-in user u4 see nothing -------
  foreach t in array array[p3::text, u4::text] loop
    perform set_config('request.jwt.claims', json_build_object('sub', t, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select (select count(*) from public.partners where id in (pr1, pr2, pr3))
         + (select count(*) from public.partner_credentials where api_key like '%-RLSFIX')
         + (select count(*) from public.partner_docs where id in (d1, d2))
         + (select count(*) from storage.objects where bucket_id = 'partner-files' and name = any(fixture_files)) into n;
    r := r || jsonb_build_object(case when t = p3::text then 'disabled_partner_sees_nothing' else 'non_partner_sees_nothing' end, n = 0);
    execute 'reset role';
  end loop;

  -- ---- admin sees and edits everything except the active switch ------------
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.partners where id in (pr1, pr2, pr3);
  r := r || jsonb_build_object('admin_sees_all_partners', n = 3);
  select count(*) into n from public.partner_credentials where api_key like '%-RLSFIX';
  r := r || jsonb_build_object('admin_sees_all_credentials', n = 3);
  update public.partners set company = 'P3 Renamed' where id = pr3;
  get diagnostics n = row_count;
  r := r || jsonb_build_object('admin_can_rename_partner', n = 1);
  begin
    update public.partners set active = true where id = pr3;
    r := r || jsonb_build_object('admin_active_only_via_function', false);
  exception when insufficient_privilege then
    r := r || jsonb_build_object('admin_active_only_via_function', true);
  end;
  insert into public.partner_credentials(partner_id, label, api_key) values (pr2, 'P2 second', 'KEY-P2B-RLSFIX');
  update public.partner_docs set body = 'edited' where id = d1;
  get diagnostics n = row_count;
  r := r || jsonb_build_object('admin_can_edit_docs', n = 1);
  begin
    insert into storage.objects(bucket_id, name) values ('partner-files', 'certificates/rls-test-fixture/new.pdf');
    r := r || jsonb_build_object('admin_can_upload', true);
  exception when insufficient_privilege then
    r := r || jsonb_build_object('admin_can_upload', false);
  end;
  begin
    insert into storage.objects(bucket_id, name) values ('partner-files', 'elsewhere/new.pdf');
    r := r || jsonb_build_object('admin_upload_folder_pinned', false);
  exception when insufficient_privilege then
    r := r || jsonb_build_object('admin_upload_folder_pinned', true);
  end;
  begin
    update public.partners set user_id = p2 where id = pr1;
    r := r || jsonb_build_object('admin_cannot_repoint_login', false);
  exception when insufficient_privilege then
    r := r || jsonb_build_object('admin_cannot_repoint_login', true);
  end;
  execute 'reset role';

  -- ---- p2 sees its new key and nobody else's -------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', p2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.partner_credentials where api_key like 'KEY-P2%-RLSFIX';
  r := r || jsonb_build_object('p2_sees_its_new_key', n = 2);
  select count(*) into n from public.partner_credentials where api_key like '%-RLSFIX' and api_key not like 'KEY-P2%';
  r := r || jsonb_build_object('p2_sees_no_foreign_key', n = 0);
  execute 'reset role';

  -- ---- disabling an active partner cuts its existing session at once -------
  update public.partners set active = false where id = pr1;   -- what admin-partners setActive does
  perform set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (select count(*) from public.partners where id = pr1)
       + (select count(*) from public.partner_credentials where partner_id = pr1)
       + (select count(*) from public.partner_docs where id in (d1, d2))
       + (select count(*) from storage.objects where bucket_id = 'partner-files' and name = any(fixture_files)) into n;
  r := r || jsonb_build_object('disabling_cuts_existing_session', n = 0);
  execute 'reset role';

  -- ---- activation: flag and login ban change together, service role only --
  perform public.admin_set_partner_active(pr2, false);
  select count(*) into n from public.partners p join auth.users u on u.id = p.user_id
    where p.id = pr2 and not p.active and u.banned_until > now() + interval '50 years';
  r := r || jsonb_build_object('disable_sets_flag_and_ban_together', n = 1);
  perform public.admin_set_partner_active(pr2, true);
  select count(*) into n from public.partners p join auth.users u on u.id = p.user_id
    where p.id = pr2 and p.active and u.banned_until is null;
  r := r || jsonb_build_object('enable_lifts_ban_and_flag_together', n = 1);
  begin
    perform public.admin_set_partner_active(gen_random_uuid(), false);
    r := r || jsonb_build_object('activation_unknown_partner_refused', false);
  exception when no_data_found then
    r := r || jsonb_build_object('activation_unknown_partner_refused', true);
  end;
  -- a partners row pointing at an admin cannot exist (trigger); build one anyway
  -- to prove the activation function refuses it on its own
  execute 'alter table public.partners disable trigger partners_not_admin';
  insert into public.partners(user_id, login_email, company, contact_email) values (admin_id, 'rls-admin@test.invalid', 'Admin Co', 'rls-admin@test.invalid') returning id into pr3;
  execute 'alter table public.partners enable trigger partners_not_admin';
  begin
    perform public.admin_set_partner_active(pr3, false);
    r := r || jsonb_build_object('activation_refuses_admin_login', false);
  exception when check_violation then
    r := r || jsonb_build_object('activation_refuses_admin_login', true);
  end;
  select count(*) into n from auth.users where id = admin_id and banned_until is null;
  r := r || jsonb_build_object('admin_login_never_banned', n = 1);
  foreach t in array array['anon', admin_id::text] loop
    perform set_config('request.jwt.claims', case when t = 'anon' then '{"role":"anon"}'
      else json_build_object('sub', t, 'role', 'authenticated')::text end, true);
    execute format('set local role %I', case when t = 'anon' then 'anon' else 'authenticated' end);
    begin
      perform public.admin_set_partner_active(pr2, false);
      r := r || jsonb_build_object('activation_denied_to_' || case when t = 'anon' then 'anon' else 'signed_in_admin' end, false);
    exception when insufficient_privilege then
      r := r || jsonb_build_object('activation_denied_to_' || case when t = 'anon' then 'anon' else 'signed_in_admin' end, true);
    end;
    begin
      update storage.buckets set public = true where id = 'partner-files';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
  end loop;
  select count(*) into n from storage.buckets where id = 'partner-files' and not public;
  r := r || jsonb_build_object('bucket_stays_private', n = 1);

  raise exception 'PARTNER_RLS_RESULT %', r::text;
end
$$;
