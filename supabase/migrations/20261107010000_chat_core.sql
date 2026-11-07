-- 왈도쳇 채팅 코어: 대화, 멤버, 메시지, 반응, 첨부, 실시간, 푸시 트리거

create extension if not exists pg_net with schema extensions;

-- 프로젝트별 설정 (클라이언트 접근 불가: RLS 정책 없음)
create table public.app_settings (
  key text primary key,
  value text not null
);
alter table public.app_settings enable row level security;
insert into public.app_settings (key, value)
values ('functions_url', 'https://vyzwxjnfppqmeznbzsnb.supabase.co/functions/v1');

-- ───────────── 테이블 ─────────────
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('dm', 'group', 'space')),
  name text check (name is null or char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 300),
  is_public boolean not null default false,
  dm_key text unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_preview text,
  check ((type = 'dm') = (dm_key is not null)),
  check (not is_public or type = 'space')
);
alter table public.conversations enable row level security;

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);
alter table public.conversation_members enable row level security;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 4000),
  reply_to uuid references public.messages (id) on delete set null,
  attachment_path text,
  attachment_name text,
  attachment_type text,
  attachment_size integer,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  notified_at timestamptz,
  check (char_length(btrim(body)) > 0 or attachment_path is not null or deleted_at is not null)
);
create index messages_conv_created_idx on public.messages (conversation_id, created_at desc);
create index messages_reply_idx on public.messages (reply_to);
alter table public.messages enable row level security;

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
alter table public.message_reactions enable row level security;

-- ───────────── 헬퍼 (RLS 재귀 방지용 security definer) ─────────────
create or replace function public.is_member(cid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = cid and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_dm(cid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.conversations where id = cid and type = 'dm');
$$;

create or replace function public.can_access_message(mid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.messages m
    join public.conversation_members cm on cm.conversation_id = m.conversation_id
    where m.id = mid and cm.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_access_path(p text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when split_part(p, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_member(split_part(p, '/', 1)::uuid)
    else false
  end;
$$;

revoke execute on function public.is_member(uuid), public.is_dm(uuid),
  public.can_access_message(uuid), public.can_access_path(text) from public, anon;
grant execute on function public.is_member(uuid), public.is_dm(uuid),
  public.can_access_message(uuid), public.can_access_path(text) to authenticated;

-- ───────────── RLS 정책 ─────────────
create policy "conversations_select" on public.conversations
  for select to authenticated
  using (public.is_member(id) or (type = 'space' and is_public));

create policy "members_select" on public.conversation_members
  for select to authenticated using (public.is_member(conversation_id));
-- 나가기: 그룹/스페이스에서 본인 행만 삭제 가능 (DM은 나갈 수 없음)
create policy "members_leave" on public.conversation_members
  for delete to authenticated
  using (user_id = (select auth.uid()) and not public.is_dm(conversation_id));

create policy "messages_select" on public.messages
  for select to authenticated using (public.is_member(conversation_id));
create policy "messages_insert" on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_member(conversation_id)
    and deleted_at is null
    and (attachment_path is null or public.can_access_path(attachment_path))
  );
create policy "messages_update_own" on public.messages
  for update to authenticated
  using (sender_id = (select auth.uid()) and public.is_member(conversation_id))
  with check (sender_id = (select auth.uid()));

create policy "reactions_select" on public.message_reactions
  for select to authenticated using (public.can_access_message(message_id));
create policy "reactions_insert" on public.message_reactions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_access_message(message_id));
create policy "reactions_delete_own" on public.message_reactions
  for delete to authenticated using (user_id = (select auth.uid()));

-- 권한 최소화: anon 전부 회수, authenticated는 필요한 것만
revoke all on public.app_settings, public.conversations, public.conversation_members,
  public.messages, public.message_reactions from anon;
revoke insert, update, delete on public.conversations from authenticated;
revoke insert, update on public.conversation_members from authenticated;
revoke all on public.app_settings from authenticated;
revoke update on public.messages from authenticated;
grant update (body, deleted_at) on public.messages to authenticated;
revoke delete on public.messages from authenticated;
revoke update on public.message_reactions from authenticated;

-- ───────────── 메시지 트리거 ─────────────
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.body := btrim(new.body);
  new.edited_at := null;
  new.deleted_at := null;
  new.notified_at := null;
  new.created_at := now();
  if new.reply_to is not null and not exists (
    select 1 from public.messages r
    where r.id = new.reply_to and r.conversation_id = new.conversation_id
  ) then
    raise exception 'INVALID_REPLY' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger messages_before_insert before insert on public.messages
  for each row execute function public.messages_before_insert();

create or replace function public.messages_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    raise exception 'MESSAGE_DELETED' using errcode = 'P0001';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
    new.body := '';
    new.attachment_path := null;
    new.attachment_name := null;
    new.attachment_type := null;
    new.attachment_size := null;
  elsif new.body is distinct from old.body then
    new.body := btrim(new.body);
    if char_length(new.body) = 0 and old.attachment_path is null then
      raise exception 'EMPTY_MESSAGE' using errcode = 'P0001';
    end if;
    new.edited_at := now();
  end if;
  return new;
end;
$$;
create trigger messages_before_update before update on public.messages
  for each row execute function public.messages_before_update();

create or replace function public.messages_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  fn_url text;
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_message_preview = case
        when new.attachment_path is not null and char_length(new.body) = 0 then '사진'
        else left(new.body, 120)
      end
  where id = new.conversation_id;

  -- 푸시 알림: 실패해도 메시지 전송은 막지 않는다.
  begin
    select value into fn_url from public.app_settings where key = 'functions_url';
    if fn_url is not null then
      perform net.http_post(
        url := fn_url || '/notify-message',
        body := jsonb_build_object('message_id', new.id),
        headers := '{"Content-Type":"application/json"}'::jsonb,
        timeout_milliseconds := 5000
      );
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function public.messages_after_insert();

revoke execute on function public.messages_before_insert(), public.messages_before_update(),
  public.messages_after_insert() from public, anon, authenticated;

-- ───────────── RPC ─────────────
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
  if not exists (select 1 from public.profiles where id = p_other) then
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
  select cid, p.id from public.profiles p where p.id = any (p_member_ids) and p.id <> me
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
  select p_conversation, p.id from public.profiles p where p.id = any (p_user_ids)
  on conflict do nothing;
end;
$$;

create or replace function public.join_space(p_conversation uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'NOT_AUTHENTICATED' using errcode = '28000'; end if;
  if not exists (select 1 from public.conversations where id = p_conversation and type = 'space' and is_public) then
    raise exception 'NOT_JOINABLE' using errcode = 'P0001';
  end if;
  insert into public.conversation_members (conversation_id, user_id)
  values (p_conversation, (select auth.uid())) on conflict do nothing;
end;
$$;

create or replace function public.mark_read(p_conversation uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.conversation_members
  set last_read_at = now()
  where conversation_id = p_conversation and user_id = (select auth.uid());
$$;

create or replace function public.browse_spaces(p_query text default '')
returns table (id uuid, name text, description text, member_count bigint)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.name, c.description,
         (select count(*) from public.conversation_members m where m.conversation_id = c.id)
  from public.conversations c
  where c.type = 'space' and c.is_public
    and not exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id and m.user_id = (select auth.uid()))
    and (coalesce(btrim(p_query), '') = '' or position(lower(btrim(p_query)) in lower(c.name)) > 0)
  order by 4 desc, c.created_at desc
  limit 50;
$$;

create or replace function public.list_conversations()
returns table (
  id uuid, type text, name text, title text, avatar_url text, peer_id uuid,
  is_public boolean, last_message_at timestamptz, last_message_preview text,
  last_read_at timestamptz, unread_count bigint, member_count bigint, created_at timestamptz
)
language sql stable set search_path = ''
as $$
  select
    c.id, c.type, c.name,
    case when c.type = 'dm' then coalesce(peer.display_name, '알 수 없음')
         else coalesce(c.name, (
           select string_agg(x.display_name, ', ' order by x.display_name)
           from (
             select p.display_name
             from public.conversation_members m
             join public.profiles p on p.id = m.user_id
             where m.conversation_id = c.id and m.user_id <> (select auth.uid())
             order by p.display_name limit 3
           ) x), '나')
    end as title,
    peer.avatar_url, peer.id as peer_id, c.is_public,
    c.last_message_at, c.last_message_preview, cm.last_read_at,
    (select count(*) from public.messages m
       where m.conversation_id = c.id and m.created_at > cm.last_read_at
         and m.sender_id <> (select auth.uid()) and m.deleted_at is null) as unread_count,
    (select count(*) from public.conversation_members m2 where m2.conversation_id = c.id) as member_count,
    c.created_at
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id
  left join lateral (
    select p.id, p.display_name, p.avatar_url
    from public.conversation_members m
    join public.profiles p on p.id = m.user_id
    where c.type = 'dm' and m.conversation_id = c.id and m.user_id <> cm.user_id
    limit 1
  ) peer on true
  where cm.user_id = (select auth.uid())
  order by coalesce(c.last_message_at, c.created_at) desc;
$$;

revoke execute on function public.create_dm(uuid), public.create_conversation(text, text, uuid[], boolean, text),
  public.add_members(uuid, uuid[]), public.join_space(uuid), public.mark_read(uuid),
  public.browse_spaces(text), public.list_conversations() from public, anon;
grant execute on function public.create_dm(uuid), public.create_conversation(text, text, uuid[], boolean, text),
  public.add_members(uuid, uuid[]), public.join_space(uuid), public.mark_read(uuid),
  public.browse_spaces(text), public.list_conversations() to authenticated;

-- ───────────── Storage (이미지 첨부) ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-attachments', 'chat-attachments', false, 10485760,
        array['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
on conflict (id) do nothing;

create policy "attachments_select_members" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-attachments' and public.can_access_path(name));
create policy "attachments_insert_members" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-attachments' and public.can_access_path(name));

-- ───────────── Realtime ─────────────
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
alter publication supabase_realtime add table
  public.messages, public.message_reactions, public.conversation_members;
