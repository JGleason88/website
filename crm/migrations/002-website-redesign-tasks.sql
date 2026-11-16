-- Run once in Supabase → SQL Editor (Nov 2026 website redesign).
-- Adds form-specific follow-up tasks for the new pre-approval and
-- power of sale list forms. Safe to run more than once.

create or replace function public.capture_lead(p jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_form   text := left(coalesce(nullif(trim(p->>'form'), ''), 'website'), 60);
  v_email  text := nullif(lower(trim(left(p->>'email', 200))), '');
  v_phone  text := nullif(trim(left(p->>'phone', 40)), '');
  v_first  text := nullif(trim(left(p->>'first_name', 80)), '');
  v_last   text := nullif(trim(left(p->>'last_name', 80)), '');
  v_addr   text := nullif(trim(left(p->>'address', 200)), '');
  v_type   text := case when p->>'type' in ('Buyer','Seller','Mortgage','Renewal','Investor') then p->>'type' else 'Lead' end;
  v_consent boolean := coalesce((p->>'consent_email')::boolean, false);
  v_csrc   text := 'Website form "' || left(coalesce(p->>'form', 'website'), 60) || '" at ' || left(coalesce(p->>'consent_page', ''), 200);
  v_fields jsonb;
  v_tags   text[];
  v_id     uuid;
  v_new    boolean := false;
begin
  if length(p::text) > 10000 then raise exception 'payload too large'; end if;
  if v_email is null and v_phone is null then raise exception 'email or phone required'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email'; end if;
  -- crude flood guard
  if (select count(*) from contacts where created_at > now() - interval '10 minutes' and source like 'Website%') > 30 then
    raise exception 'rate limited';
  end if;

  select coalesce(jsonb_object_agg(left(key, 60), left(value, 1000)), '{}'::jsonb)
    into v_fields
    from (select key, value from jsonb_each_text(coalesce(p->'fields', '{}'::jsonb)) limit 40) f;

  select coalesce(array_agg(distinct left(trim(t), 40)), '{}')
    into v_tags
    from (select jsonb_array_elements_text(coalesce(p->'tags', '[]'::jsonb)) t limit 6) s
   where trim(t) <> '';
  v_tags := v_tags || ('Web: ' || v_form);

  if v_email is not null then
    select id into v_id from contacts where email = v_email;
  end if;
  if v_id is null and v_phone is not null and length(regexp_replace(v_phone, '\D', '', 'g')) >= 10 then
    select id into v_id from contacts
     where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = right(regexp_replace(v_phone, '\D', '', 'g'), 10)
     limit 1;
  end if;

  if v_id is null then
    insert into contacts (first_name, last_name, email, phone, address, type, source, tags, details,
                          consent_email, consent_at, consent_source)
    values (v_first, v_last, v_email, v_phone, v_addr, v_type, 'Website: ' || v_form, v_tags,
            jsonb_build_object(v_form, v_fields),
            v_consent, case when v_consent then now() end, case when v_consent then v_csrc end)
    returning id into v_id;
    v_new := true;
  else
    update contacts set
      first_name = coalesce(first_name, v_first),
      last_name  = coalesce(last_name, v_last),
      email      = coalesce(email, v_email),
      phone      = coalesce(phone, v_phone),
      address    = coalesce(address, v_addr),
      type       = case when type = 'Lead' then v_type else type end,
      tags       = tags || v_tags,
      details    = details || jsonb_build_object(v_form, v_fields),
      consent_email  = consent_email or v_consent,
      consent_at     = case when v_consent and not consent_email then now() else consent_at end,
      consent_source = case when v_consent and not consent_email then v_csrc else consent_source end,
      last_activity_at = now()
    where id = v_id;
  end if;

  insert into activities (contact_id, kind, body, data)
  values (v_id, 'form', case when v_new then 'New lead from ' else 'Submitted again: ' end || v_form, v_fields);

  if v_consent then
    insert into activities (contact_id, kind, body, data)
    values (v_id, 'consent', 'Gave express consent to marketing emails (CASL)',
            jsonb_build_object('wording', left(coalesce(p->>'consent_text', ''), 1500), 'page', left(coalesce(p->>'consent_page', ''), 200), 'form', v_form));
  end if;

  if v_form = 'power-of-sale-list' then
    insert into tasks (contact_id, title, notes, due_date, priority) values
      (v_id, 'Add to REALM power of sale alert', 'Areas: ' || coalesce(v_fields->>'areas', 'not specified'), (now() at time zone 'America/Toronto')::date, 'high'),
      (v_id, 'Send personal follow-up: what are they looking for?', null, (now() at time zone 'America/Toronto')::date + 1, 'normal');
  elsif v_form = 'pre-approval' then
    insert into tasks (contact_id, title, notes, due_date, priority) values
      (v_id, 'Pre-approval lead: check Newton for their application', 'If no application by tomorrow, call them.', (now() at time zone 'America/Toronto')::date, 'high');
  else
    insert into tasks (contact_id, title, due_date, priority)
    values (v_id, 'Reply to website lead (' || v_form || ')', (now() at time zone 'America/Toronto')::date, 'high');
  end if;
end $$;
revoke all on function public.capture_lead(jsonb) from public;
grant execute on function public.capture_lead(jsonb) to anon, authenticated;
