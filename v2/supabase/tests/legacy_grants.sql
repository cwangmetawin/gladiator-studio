-- No API role may TRUNCATE (row-level security does not apply to it), add triggers or reference a public
-- table; the reads and writes the site uses, all gated by row-level security, stay as they were.
-- Raises on the first failure; run by tests/local/run-rls.sh after every migration.
do $$
declare
  t text;
  r text;
  p text;
begin
  foreach t in array array['admins', 'admin_emails', 'enquiries', 'games', 'site_content',
                           'partners', 'partner_credentials', 'partner_docs', 'partner_signup_allow'] loop
    foreach r in array array['anon', 'authenticated'] loop
      foreach p in array array['TRUNCATE', 'TRIGGER', 'REFERENCES'] loop
        if has_table_privilege(r, format('public.%I', t), p) then
          raise exception 'LEGACY_GRANTS_FAIL % can % public.%', r, p, t;
        end if;
      end loop;
    end loop;
  end loop;
  -- The legacy tables keep their API privileges; their policies decide who may use them.
  foreach t in array array['admins', 'admin_emails', 'enquiries', 'games', 'site_content'] loop
    foreach r in array array['anon', 'authenticated'] loop
      foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
        if not has_table_privilege(r, format('public.%I', t), p) then
          raise exception 'LEGACY_GRANTS_FAIL % lost % on public.%', r, p, t;
        end if;
      end loop;
    end loop;
  end loop;
  if not exists (
    select 1 from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where i.indrelid = 'public.partners'::regclass and a.attname = 'created_by'
  ) then
    raise exception 'LEGACY_GRANTS_FAIL partners.created_by has no index';
  end if;
  raise notice 'LEGACY_GRANTS_RESULT pass';
end $$;
