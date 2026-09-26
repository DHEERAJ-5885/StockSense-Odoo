-- StockSense - lookup used by the backend's password-reset (Nodemailer) flow.
-- Callable ONLY with the service-role key (never from the browser).

create or replace function public.user_id_for_email(p_email text)
returns uuid language sql security definer stable set search_path = public, auth as $$
    select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

revoke all on function public.user_id_for_email(text) from public, anon, authenticated;
grant execute on function public.user_id_for_email(text) to service_role;
