-- ============================================================
-- FINAL PROJECT MIGRATION (Part I) — QR-ATT
--
-- Run this AFTER schema.sql. It is IDEMPOTENT (safe to re-run).
--
-- What it does
--   1. Adds the Administrator role + richer profiles
--   2. Adds venue / description / status to events
--   3. Adds status / remarks to attendance
--   4. Moves attendance recording into a protected database
--      function (record_attendance) -> students can no longer
--      INSERT into attendance or events directly
--   5. Replaces the RLS policies (role based: student/teacher/admin)
--   6. Prevents users from promoting themselves (role escalation)
--   7. Adds admin report + helper functions, indexes, realtime
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste all -> Run
-- HOW TO MAKE THE FIRST ADMIN: see the bottom of this file.
-- ============================================================


-- ------------------------------------------------------------
-- 0. Backfill: make sure every auth user has a profile row
-- ------------------------------------------------------------
insert into public.profiles (id, email)
select u.id, u.email
from auth.users u
on conflict (id) do nothing;


-- ------------------------------------------------------------
-- 1. PROFILES — admin role + student/teacher details
-- ------------------------------------------------------------
do $$
declare c record;
begin
  -- drop the old CHECK (role in ('student','teacher')) whatever its name is
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'teacher', 'admin'));

alter table public.profiles
  add column if not exists student_number text,
  add column if not exists program text,
  add column if not exists section text,
  add column if not exists department text,
  add column if not exists is_active boolean not null default true;


-- ------------------------------------------------------------
-- 2. Role helper functions (SECURITY DEFINER so they can be used
--    inside RLS policies without infinite recursion)
--    A deactivated user has NO role -> every policy denies them.
-- ------------------------------------------------------------
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.is_active
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false)
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('teacher', 'admin'), false)
$$;

revoke all on function public.current_user_role() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;


-- ------------------------------------------------------------
-- 3. New-user trigger: role + details come from sign-up metadata.
--    Only 'student' or 'teacher' can be requested at sign-up;
--    anything else (including 'admin') becomes 'student'.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  requested_role text := lower(coalesce(meta ->> 'role', 'student'));
begin
  if requested_role not in ('student', 'teacher') then
    requested_role := 'student';
  end if;

  insert into public.profiles
    (id, email, full_name, role, student_number, program, section, department)
  values (
    new.id,
    new.email,
    nullif(left(trim(meta ->> 'full_name'), 100), ''),
    requested_role,
    nullif(left(trim(meta ->> 'student_number'), 30), ''),
    nullif(left(trim(meta ->> 'program'), 100), ''),
    nullif(left(trim(meta ->> 'section'), 30), ''),
    nullif(left(trim(meta ->> 'department'), 100), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ------------------------------------------------------------
-- 4. Block self-promotion: only an admin may change role/is_active.
--    (auth.uid() is NULL in the SQL editor, so you can still change
--     roles manually from the dashboard.)
-- ------------------------------------------------------------
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if not public.is_admin() then
      if new.role is distinct from old.role
         or new.is_active is distinct from old.is_active then
        raise exception 'Only administrators can change roles or account status'
          using errcode = '42501';
      end if;
    elsif auth.uid() = old.id then
      if new.role is distinct from old.role
         or new.is_active is distinct from old.is_active then
        raise exception 'Administrators cannot change their own role or status'
          using errcode = '42501';
      end if;
    end if;
  end if;

  new.id := old.id;
  new.email := old.email;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns
  before update on public.profiles
  for each row execute procedure public.protect_profile_columns();


-- ------------------------------------------------------------
-- 5. PROFILES policies
-- ------------------------------------------------------------
drop policy if exists "Profiles are viewable by owner" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Teachers can view profiles of their attendees" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_admin" on public.profiles;
drop policy if exists "profiles_select_teacher_attendees" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;

create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

create policy "profiles_select_admin"
  on public.profiles for select to authenticated
  using (public.is_admin());

create policy "profiles_select_teacher_attendees"
  on public.profiles for select to authenticated
  using (
    exists (
      select 1
      from public.attendance a
      join public.events e on e.id = a.event_id
      where a.student_id = profiles.id
        and e.created_by = auth.uid()
    )
  );

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_update_admin"
  on public.profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
-- (No INSERT policy: the trigger above creates profiles.)


-- ------------------------------------------------------------
-- 6. EVENTS — venue, description, status
-- ------------------------------------------------------------
alter table public.events
  add column if not exists venue text,
  add column if not exists description text,
  add column if not exists status text not null default 'open',
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass and conname = 'events_status_check'
  ) then
    alter table public.events
      add constraint events_status_check check (status in ('open', 'closed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass and conname = 'events_time_check'
  ) then
    alter table public.events
      add constraint events_time_check
      check (start_time is null or end_time is null or end_time > start_time)
      not valid;
  end if;
end $$;

-- event_code is generated by the database when the app does not send one
alter table public.events
  alter column event_code
  set default ('EVT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at
  before update on public.events
  for each row execute procedure public.touch_updated_at();


-- ------------------------------------------------------------
-- 7. EVENTS policies  (students can read but NEVER write)
-- ------------------------------------------------------------
drop policy if exists "Events are readable by any authenticated user" on public.events;
drop policy if exists "Users can insert events" on public.events;
drop policy if exists "Users can update their own events" on public.events;
drop policy if exists "events_select_active_users" on public.events;
drop policy if exists "events_insert_staff" on public.events;
drop policy if exists "events_update_owner_or_admin" on public.events;
drop policy if exists "events_delete_admin" on public.events;

create policy "events_select_active_users"
  on public.events for select to authenticated
  using (public.current_user_role() is not null);

create policy "events_insert_staff"
  on public.events for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid());

create policy "events_update_owner_or_admin"
  on public.events for update to authenticated
  using (public.is_admin() or (public.is_staff() and created_by = auth.uid()))
  with check (public.is_admin() or (public.is_staff() and created_by = auth.uid()));

create policy "events_delete_admin"
  on public.events for delete to authenticated
  using (public.is_admin());


-- ------------------------------------------------------------
-- 8. ATTENDANCE — status, remarks, extra relationship to profiles
-- ------------------------------------------------------------
alter table public.attendance
  add column if not exists status text not null default 'present',
  add column if not exists remarks text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.attendance'::regclass and conname = 'attendance_status_check'
  ) then
    alter table public.attendance
      add constraint attendance_status_check
      check (status in ('present', 'late', 'absent', 'excused'));
  end if;

  -- attendance.student_id -> profiles.id (so the relationship is explicit)
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.attendance'::regclass
      and conname = 'attendance_student_profile_fk'
  ) then
    alter table public.attendance
      add constraint attendance_student_profile_fk
      foreign key (student_id) references public.profiles (id) on delete cascade;
  end if;
end $$;

create index if not exists attendance_event_idx on public.attendance (event_id);
create index if not exists attendance_student_idx on public.attendance (student_id);
create index if not exists events_created_by_idx on public.events (created_by);

drop trigger if exists attendance_touch_updated_at on public.attendance;
create trigger attendance_touch_updated_at
  before update on public.attendance
  for each row execute procedure public.touch_updated_at();


-- ------------------------------------------------------------
-- 9. ATTENDANCE policies
--    NO insert policy for students: the only way to record
--    attendance is the record_attendance() function below.
-- ------------------------------------------------------------
drop policy if exists "Students can view their own attendance" on public.attendance;
drop policy if exists "Students can insert their own attendance" on public.attendance;
drop policy if exists "Teachers can view attendance for their events" on public.attendance;
drop policy if exists "attendance_select_own" on public.attendance;
drop policy if exists "attendance_select_teacher_events" on public.attendance;
drop policy if exists "attendance_select_admin" on public.attendance;
drop policy if exists "attendance_update_admin" on public.attendance;
drop policy if exists "attendance_delete_admin" on public.attendance;

create policy "attendance_select_own"
  on public.attendance for select to authenticated
  using (auth.uid() = student_id);

create policy "attendance_select_teacher_events"
  on public.attendance for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = attendance.event_id
        and e.created_by = auth.uid()
    )
  );

create policy "attendance_select_admin"
  on public.attendance for select to authenticated
  using (public.is_admin());

create policy "attendance_update_admin"
  on public.attendance for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "attendance_delete_admin"
  on public.attendance for delete to authenticated
  using (public.is_admin());


-- ------------------------------------------------------------
-- 10. record_attendance(): ALL validation happens here, on the
--     server, so a modified app / forged QR cannot bypass it.
--     Returns jsonb { success, code, message, eventTitle?, scannedAt? }
--     codes: ok | unauthorized | invalid_qr | closed | not_started
--            | ended | duplicate
-- ------------------------------------------------------------
create or replace function public.record_attendance(p_event_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_role  text;
  v_code  text := trim(coalesce(p_event_code, ''));
  v_event public.events%rowtype;
  v_time  timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'unauthorized',
      'message', 'You must be signed in to record attendance.');
  end if;

  v_role := public.current_user_role();
  if v_role is null then
    return jsonb_build_object('success', false, 'code', 'unauthorized',
      'message', 'Your account is disabled or has no profile.');
  end if;
  if v_role <> 'student' then
    return jsonb_build_object('success', false, 'code', 'unauthorized',
      'message', 'Only student accounts can record attendance.');
  end if;

  if v_code = '' or length(v_code) > 64 then
    return jsonb_build_object('success', false, 'code', 'invalid_qr',
      'message', 'This is not a valid attendance QR code.');
  end if;

  select * into v_event from public.events where event_code = v_code;
  if not found then
    return jsonb_build_object('success', false, 'code', 'invalid_qr',
      'message', 'This QR code does not match any event.');
  end if;

  if v_event.status <> 'open' then
    return jsonb_build_object('success', false, 'code', 'closed',
      'message', 'This event is closed. Attendance can no longer be recorded.',
      'eventTitle', v_event.title);
  end if;

  if v_event.start_time is not null and now() < v_event.start_time then
    return jsonb_build_object('success', false, 'code', 'not_started',
      'message', 'This event has not started yet.',
      'eventTitle', v_event.title);
  end if;

  if v_event.end_time is not null and now() > v_event.end_time then
    return jsonb_build_object('success', false, 'code', 'ended',
      'message', 'This event has already ended.',
      'eventTitle', v_event.title);
  end if;

  begin
    insert into public.attendance (student_id, event_id, status)
    values (v_uid, v_event.id, 'present')
    returning scanned_at into v_time;
  exception when unique_violation then
    return jsonb_build_object('success', false, 'code', 'duplicate',
      'message', 'You have already recorded attendance for this event.',
      'eventTitle', v_event.title);
  end;

  return jsonb_build_object('success', true, 'code', 'ok',
    'message', 'Attendance recorded!',
    'eventTitle', v_event.title,
    'scannedAt', v_time);
end;
$$;

revoke all on function public.record_attendance(text) from public, anon;
grant execute on function public.record_attendance(text) to authenticated;


-- ------------------------------------------------------------
-- 11. Helper + report functions for teachers / admins
-- ------------------------------------------------------------
create or replace function public.count_active_students()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_staff()
      then (select count(*)::int from public.profiles where role = 'student' and is_active)
    else 0
  end
$$;

create or replace function public.get_system_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'students',        (select count(*) from public.profiles where role = 'student'),
    'teachers',        (select count(*) from public.profiles where role = 'teacher'),
    'admins',          (select count(*) from public.profiles where role = 'admin'),
    'inactive_users',  (select count(*) from public.profiles where not is_active),
    'events_total',    (select count(*) from public.events),
    'events_open',     (select count(*) from public.events where status = 'open'),
    'events_closed',   (select count(*) from public.events where status = 'closed'),
    'attendance_total',(select count(*) from public.attendance),
    'attendance_24h',  (select count(*) from public.attendance
                        where scanned_at >= now() - interval '24 hours')
  );
end;
$$;

revoke all on function public.count_active_students() from public, anon;
revoke all on function public.get_system_report() from public, anon;
grant execute on function public.count_active_students() to authenticated;
grant execute on function public.get_system_report() to authenticated;


-- ------------------------------------------------------------
-- 12. Realtime: lets teachers/admins see new scans instantly.
--     RLS still applies, so people only receive rows they may read.
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'attendance'
     ) then
    alter publication supabase_realtime add table public.attendance;
  end if;
end $$;

-- refresh the API schema cache
notify pgrst, 'reload schema';

-- ============================================================
-- CREATE THE FIRST ADMINISTRATOR
-- 1. Register a normal account in the app (any role).
-- 2. Run this in the SQL editor with that account's email:
--
--    update public.profiles
--       set role = 'admin'
--     where email = 'your-admin@email.com';
--
-- (Allowed because the SQL editor has no auth.uid().)
-- After that, the admin can promote/demote others inside the app.
-- ============================================================
