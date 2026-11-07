-- 이메일 인증을 마친 사용자만 검색/대화 상대로 노출한다.
alter table public.profiles add column verified_at timestamptz;
update public.profiles p set verified_at = coalesce(u.email_confirmed_at, now())
from auth.users u where u.id = p.id;

drop policy "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_verified" on public.profiles
  for select to authenticated
  using (verified_at is not null or id = (select auth.uid()));

revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  norm text;
  dom text;
begin
  if new.email is null then
    raise exception 'EMAIL_REQUIRED' using errcode = 'P0001';
  end if;

  norm := public.normalize_email(new.email);
  dom := split_part(norm, '@', 2);

  if exists (select 1 from public.blocked_email_domains where domain = dom) then
    raise exception 'EMAIL_DOMAIN_BLOCKED' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.account_identities where email_normalized = norm) then
    raise exception 'EMAIL_ALREADY_REGISTERED' using errcode = 'P0001';
  end if;

  insert into public.account_identities (user_id, email_normalized) values (new.id, norm);

  insert into public.profiles (id, display_name, avatar_url, verified_at)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
             nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
             split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    new.email_confirmed_at
  );
  return new;
end;
$$;

create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set verified_at = new.email_confirmed_at where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

revoke execute on function public.handle_user_confirmed() from public, anon, authenticated;

-- 인증된 사용자만 대화 상대가 될 수 있다.
create or replace function public.create_dm(p_other uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  k text;
  cid uuid;
begin
  if me is null then raise exception 'NOT_AUTHENTICATED' using errcode = '28000'; end if;
  if p_other is null or p_other = me then raise exception 'INVALID_TARGET' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles where id = p_other and verified_at is not null) then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0001';
  end if;
  k := least(me::text, p_other::text) || ':' || greatest(me::text, p_other::text);
  select id into cid from public.conversations where dm_key = k;
  if cid is null then
    insert into public.conversations (type, dm_key, created_by) values ('dm', k, me)
    on conflict (dm_key) do nothing returning id into cid;
    if cid is null then select id into cid from public.conversations where dm_key = k; end if;
  end if;
  insert into public.conversation_members (conversation_id, user_id)
  values (cid, me), (cid, p_other) on conflict do nothing;
  return cid;
end;
$$;

create or replace function public.create_conversation(
  p_type text, p_name text, p_member_ids uuid[] default '{}',
  p_is_public boolean default false, p_description text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  cid uuid;
  n int := coalesce(array_length(p_member_ids, 1), 0);
begin
  if me is null then raise exception 'NOT_AUTHENTICATED' using errcode = '28000'; end if;
  if p_type not in ('group', 'space') then raise exception 'INVALID_TYPE' using errcode = 'P0001'; end if;
  p_name := nullif(btrim(p_name), '');
  if p_type = 'space' and p_name is null then raise exception 'NAME_REQUIRED' using errcode = 'P0001'; end if;
  if p_type = 'group' and n = 0 then raise exception 'MEMBERS_REQUIRED' using errcode = 'P0001'; end if;
  if p_is_public and p_type <> 'space' then raise exception 'INVALID_TYPE' using errcode = 'P0001'; end if;
  if n > 200 then raise exception 'TOO_MANY_MEMBERS' using errcode = 'P0001'; end if;

  insert into public.conversations (type, name, description, is_public, created_by)
  values (p_type, p_name, nullif(btrim(p_description), ''), coalesce(p_is_public, false), me)
  returning id into cid;

  insert into public.conversation_members (conversation_id, user_id, role) values (cid, me, 'owner');
  insert into public.conversation_members (conversation_id, user_id)
  select cid, p.id from public.profiles p
  where p.id = any (p_member_ids) and p.id <> me and p.verified_at is not null
  on conflict do nothing;
  return cid;
end;
$$;

create or replace function public.add_members(p_conversation uuid, p_user_ids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member(p_conversation) then raise exception 'NOT_A_MEMBER' using errcode = '42501'; end if;
  if public.is_dm(p_conversation) then raise exception 'INVALID_TYPE' using errcode = 'P0001'; end if;
  if (select count(*) from public.conversation_members where conversation_id = p_conversation)
     + coalesce(array_length(p_user_ids, 1), 0) > 500 then
    raise exception 'TOO_MANY_MEMBERS' using errcode = 'P0001';
  end if;
  insert into public.conversation_members (conversation_id, user_id)
  select p_conversation, p.id from public.profiles p
  where p.id = any (p_user_ids) and p.verified_at is not null
  on conflict do nothing;
end;
$$;
