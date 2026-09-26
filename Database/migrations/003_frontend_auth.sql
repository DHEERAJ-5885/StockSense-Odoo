-- StockSense - support for the front-end sign-in / sign-up screens
--
-- Run once in the Supabase SQL Editor (safe to re-run). It does three things:
--   1. Saves the Login ID and role chosen at sign-up on the user's profile.
--   2. Adds two lookups the sign-in page needs BEFORE the user is signed in:
--        email_for_login(login_id)  -> the email to hand to Supabase Auth
--        login_id_available(login_id) -> is this Login ID free?
--   3. Stops a user from promoting themselves (profiles.role) from the browser.

-- ---------------------------------------------------------------------
-- 0. Login ID rules: 6-12 characters, stored lower-case, unique (unique index is in 002)
-- ---------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'profiles_login_id_length') then
        alter table public.profiles
            add constraint profiles_login_id_length
            check (login_id is null or char_length(login_id) between 6 and 12);
    end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. New-user trigger: keep full_name, login_id and role from the sign-up form.
--    The browser can only ask for 'manager' or 'staff'; 'admin' is never granted here.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_role text := lower(coalesce(new.raw_user_meta_data ->> 'role', 'staff'));
begin
    if v_role not in ('manager', 'staff') then
        v_role := 'staff';
    end if;

    insert into public.profiles (id, full_name, login_id, role)
    values (
        new.id,
        new.raw_user_meta_data ->> 'full_name',
        lower(nullif(trim(new.raw_user_meta_data ->> 'login_id'), '')),
        v_role
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Lookups the sign-in page uses while still signed out
-- ---------------------------------------------------------------------
create or replace function public.email_for_login(p_login_id text)
returns text language sql security definer stable set search_path = public, auth as $$
    select u.email::text
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.login_id = lower(trim(p_login_id))
     limit 1;
$$;

create or replace function public.login_id_available(p_login_id text)
returns boolean language sql security definer stable set search_path = public as $$
    select not exists (select 1 from public.profiles where login_id = lower(trim(p_login_id)));
$$;

revoke all on function public.email_for_login(text) from public;
revoke all on function public.login_id_available(text) from public;
grant execute on function public.email_for_login(text) to anon, authenticated;
grant execute on function public.login_id_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Only an admin (or the SQL editor / service role) can change a role
-- ---------------------------------------------------------------------
create or replace function public.protect_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if new.role is distinct from old.role
       and auth.uid() is not null
       and not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
        raise exception 'Only an admin can change a role';
    end if;
    return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
    before update on public.profiles
    for each row execute function public.protect_profile_role();
