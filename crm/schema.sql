-- ============================================================
-- Josh Gleason CRM — database setup
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Who may use the CRM ------------------------------------------
-- Only user accounts listed here can see CRM data, and only after
-- completing 2-step verification (aal2) in the current session.
create table if not exists public.crm_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.crm_users enable row level security;
-- (no policies: nobody can read or change this table through the API)

create or replace function public.is_crm_user()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
     and exists (select 1 from public.crm_users u where u.user_id = auth.uid());
$$;
revoke all on function public.is_crm_user() from public;
grant execute on function public.is_crm_user() to authenticated;

-- ---------- Contacts ------------------------------------------------------
create table if not exists public.contacts (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  first_name       text,
  last_name        text,
  email            text unique,
  phone            text,
  address          text,
  city             text,
  type             text not null default 'Lead',
  stage            text not null default 'New',
  stage_changed_at timestamptz not null default now(),
  source           text,
  tags             text[] not null default '{}',
  renewal_date     date,
  lender           text,
  follow_up        date,
  birthday         date,
  consent_email    boolean not null default false,
  consent_at       timestamptz,
  consent_source   text,
  notes            text,
  details          jsonb not null default '{}'::jsonb,
  last_activity_at timestamptz not null default now()
);
alter table public.contacts add column if not exists consent_at timestamptz;
alter table public.contacts add column if not exists consent_source text;
create index if not exists contacts_tags_idx    on public.contacts using gin (tags);
create index if not exists contacts_stage_idx   on public.contacts (stage);
create index if not exists contacts_created_idx on public.contacts (created_at desc);

-- Tidy values on the way in, stamp updates and stage changes.
create or replace function public.contacts_before_write()
returns trigger language plpgsql as $$
begin
  new.email := nullif(lower(trim(new.email)), '');
  new.first_name := nullif(trim(new.first_name), '');
  new.last_name := nullif(trim(new.last_name), '');
  new.phone := nullif(trim(new.phone), '');
  new.tags := coalesce(array(
      select distinct t from (select nullif(trim(x), '') as t from unnest(new.tags) x) s
      where t is not null order by t), '{}');
  new.updated_at := now();
  if new.consent_email and new.consent_at is null then
    new.consent_at := now();
    new.consent_source := coalesce(new.consent_source, 'Recorded manually in CRM');
  elsif not new.consent_email then
    new.consent_at := null; new.consent_source := null;
  end if;
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists contacts_before_write on public.contacts;
create trigger contacts_before_write before insert or update on public.contacts
  for each row execute function public.contacts_before_write();

-- ---------- Tasks ---------------------------------------------------------
create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  contact_id uuid references public.contacts(id) on delete cascade,
  title      text not null,
  notes      text,
  due_date   date,
  priority   text not null default 'normal' check (priority in ('low','normal','high')),
  done       boolean not null default false,
  done_at    timestamptz
);
create index if not exists tasks_open_idx    on public.tasks (done, due_date);
create index if not exists tasks_contact_idx on public.tasks (contact_id);

-- ---------- Activity timeline ----------------------------------------------
create table if not exists public.activities (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  kind       text not null default 'note',   -- note, call, email, text, meeting, form, stage, import
  body       text,
  data       jsonb not null default '{}'::jsonb
);
create index if not exists activities_contact_idx on public.activities (contact_id, created_at desc);

-- Log stage changes on the timeline automatically.
create or replace function public.contacts_after_update()
returns trigger language plpgsql as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.activities (contact_id, kind, body)
    values (new.id, 'stage', 'Stage: ' || old.stage || ' → ' || new.stage);
  end if;
  return null;
end $$;
drop trigger if exists contacts_after_update on public.contacts;
create trigger contacts_after_update after update on public.contacts
  for each row execute function public.contacts_after_update();

-- Keep "last activity" fresh when notes or tasks are added.
create or replace function public.touch_contact()
returns trigger language plpgsql as $$
begin
  if new.contact_id is not null then
    update public.contacts set last_activity_at = now() where id = new.contact_id;
  end if;
  return null;
end $$;
drop trigger if exists activities_touch on public.activities;
create trigger activities_touch after insert on public.activities
  for each row execute function public.touch_contact();

-- ---------- Row level security: CRM users with 2-step only -----------------
alter table public.contacts   enable row level security;
alter table public.tasks      enable row level security;
alter table public.activities enable row level security;

drop policy if exists crm_contacts   on public.contacts;
drop policy if exists crm_tasks      on public.tasks;
drop policy if exists crm_activities on public.activities;
create policy crm_contacts   on public.contacts   for all to authenticated using (public.is_crm_user()) with check (public.is_crm_user());
create policy crm_tasks      on public.tasks      for all to authenticated using (public.is_crm_user()) with check (public.is_crm_user());
create policy crm_activities on public.activities for all to authenticated using (public.is_crm_user()) with check (public.is_crm_user());

revoke all on public.contacts, public.tasks, public.activities from anon;

-- ---------- Website lead capture (called by the public website) -----------
-- Write-only: it can add or enrich a contact but never reads anything back.
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

-- ---------- Bulk actions (run with the signed-in user's permissions) -------
create or replace function public.crm_bulk_tags(ids uuid[], tag text, do_add boolean)
returns integer language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  if not public.is_crm_user() then raise exception 'not allowed'; end if;
  if do_add then
    update contacts set tags = tags || trim(tag) where id = any(ids) and not (trim(tag) = any(tags));
  else
    update contacts set tags = array_remove(tags, trim(tag)) where id = any(ids) and trim(tag) = any(tags);
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.crm_bulk_set(ids uuid[], col text, val text)
returns integer language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  if not public.is_crm_user() then raise exception 'not allowed'; end if;
  if col = 'stage' then
    update contacts set stage = val where id = any(ids) and stage is distinct from val;
  elsif col = 'type' then
    update contacts set type = val where id = any(ids);
  else
    raise exception 'unsupported field %', col;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.crm_bulk_delete(ids uuid[])
returns integer language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  if not public.is_crm_user() then raise exception 'not allowed'; end if;
  delete from contacts where id = any(ids);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- Import ----------------------------------------------------------
-- rows: [{first_name, last_name, email, phone, ..., tags:[...], details:{...}}]
-- mode: 'update' (fill blanks + add tags on duplicates) or 'skip'
create or replace function public.crm_import(rows jsonb, mode text default 'update')
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  r jsonb; v_id uuid; v_email text; v_digits text;
  n_new int := 0; n_upd int := 0; n_skip int := 0;
begin
  if not public.is_crm_user() then raise exception 'not allowed'; end if;
  for r in select * from jsonb_array_elements(rows) loop
    v_id := null;
    v_email := nullif(lower(trim(r->>'email')), '');
    v_digits := right(regexp_replace(coalesce(r->>'phone', ''), '\D', '', 'g'), 10);
    if v_email is not null then
      select id into v_id from contacts where email = v_email;
    end if;
    if v_id is null and length(v_digits) = 10 then
      select id into v_id from contacts
       where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_digits limit 1;
    end if;
    if v_id is null and v_email is null and length(v_digits) < 10
       and coalesce(r->>'first_name', '') = '' and coalesce(r->>'last_name', '') = '' then
      n_skip := n_skip + 1; continue;
    end if;

    if v_id is null then
      insert into contacts (first_name, last_name, email, phone, address, city, type, stage, source, tags,
                            renewal_date, lender, follow_up, birthday, consent_email, notes, details)
      values (r->>'first_name', r->>'last_name', v_email, r->>'phone', r->>'address', r->>'city',
              coalesce(nullif(r->>'type', ''), 'Lead'), coalesce(nullif(r->>'stage', ''), 'New'),
              coalesce(nullif(r->>'source', ''), 'Import'),
              coalesce(array(select jsonb_array_elements_text(coalesce(r->'tags', '[]'::jsonb))), '{}'),
              nullif(r->>'renewal_date', '')::date, r->>'lender', nullif(r->>'follow_up', '')::date,
              nullif(r->>'birthday', '')::date,
              coalesce((r->>'consent_email')::boolean, false), r->>'notes',
              coalesce(r->'details', '{}'::jsonb))
      returning id into v_id;
      insert into activities (contact_id, kind, body) values (v_id, 'import', 'Imported');
      n_new := n_new + 1;
    elsif mode = 'skip' then
      n_skip := n_skip + 1;
    else
      update contacts set
        first_name   = coalesce(first_name, nullif(r->>'first_name', '')),
        last_name    = coalesce(last_name, nullif(r->>'last_name', '')),
        email        = coalesce(email, v_email),
        phone        = coalesce(phone, nullif(r->>'phone', '')),
        address      = coalesce(address, nullif(r->>'address', '')),
        city         = coalesce(city, nullif(r->>'city', '')),
        renewal_date = coalesce(renewal_date, nullif(r->>'renewal_date', '')::date),
        lender       = coalesce(lender, nullif(r->>'lender', '')),
        follow_up    = coalesce(follow_up, nullif(r->>'follow_up', '')::date),
        birthday     = coalesce(birthday, nullif(r->>'birthday', '')::date),
        notes        = coalesce(notes, nullif(r->>'notes', '')),
        tags         = tags || coalesce(array(select jsonb_array_elements_text(coalesce(r->'tags', '[]'::jsonb))), '{}'),
        details      = details || coalesce(r->'details', '{}'::jsonb)
      where id = v_id;
      n_upd := n_upd + 1;
    end if;
  end loop;
  return jsonb_build_object('created', n_new, 'updated', n_upd, 'skipped', n_skip);
end $$;

revoke all on function public.crm_bulk_tags(uuid[], text, boolean) from public, anon;
revoke all on function public.crm_bulk_set(uuid[], text, text) from public, anon;
revoke all on function public.crm_bulk_delete(uuid[]) from public, anon;
revoke all on function public.crm_import(jsonb, text) from public, anon;
grant execute on function public.crm_bulk_tags(uuid[], text, boolean) to authenticated;
grant execute on function public.crm_bulk_set(uuid[], text, text) to authenticated;
grant execute on function public.crm_bulk_delete(uuid[]) to authenticated;
grant execute on function public.crm_import(jsonb, text) to authenticated;

-- ============================================================
-- LAST STEP (run separately, AFTER you've created your login under
-- Authentication → Users): give your account access to the CRM.
--
--   insert into public.crm_users (user_id)
--   select id from auth.users where email = 'YOUR-LOGIN-EMAIL'
--   on conflict do nothing;
-- ============================================================
