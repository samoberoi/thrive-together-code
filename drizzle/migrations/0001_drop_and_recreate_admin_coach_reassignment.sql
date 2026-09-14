drop function if exists public.admin_reassign_coach(uuid, uuid);

create or replace function public.guard_permanent_coach_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.allow_coach_reassign', true) = 'on' then
    return coalesce(new, old);
  end if;
  if TG_OP = 'DELETE' then
    raise exception 'Coach assignments are permanent and cannot be deleted';
  end if;
  if TG_OP = 'UPDATE' and (
    new.user_id is distinct from old.user_id or
    new.coach_id is distinct from old.coach_id or
    new.is_active is distinct from true
  ) then
    raise exception 'Coach assignments are permanent and cannot be changed or deactivated';
  end if;
  if TG_OP = 'INSERT' and new.is_active is distinct from true then
    raise exception 'A new coach assignment must be active';
  end if;
  return new;
end; $$;

create or replace function public.admin_reassign_coach(_user_id uuid, _coach_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only admins can reassign coaches';
  end if;
  perform set_config('app.allow_coach_reassign', 'on', true);
  insert into public.coach_assignments (user_id, coach_id, is_active, assigned_at)
  values (_user_id, _coach_id, true, now())
  on conflict (user_id) do update set coach_id = excluded.coach_id, is_active = true, assigned_at = now();
  update public.profiles p set coach_name = c.name from public.coaches c where p.user_id = _user_id and c.id = _coach_id;
  perform set_config('app.allow_coach_reassign', 'off', true);
end; $$;

grant execute on function public.admin_reassign_coach(uuid, uuid) to authenticated;