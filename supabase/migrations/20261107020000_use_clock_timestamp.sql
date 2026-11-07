-- 같은 트랜잭션 안에서도 메시지 순서/읽음 시각이 구분되도록 clock_timestamp() 사용
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
  new.created_at := clock_timestamp();
  if new.reply_to is not null and not exists (
    select 1 from public.messages r
    where r.id = new.reply_to and r.conversation_id = new.conversation_id
  ) then
    raise exception 'INVALID_REPLY' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.mark_read(p_conversation uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.conversation_members
  set last_read_at = clock_timestamp()
  where conversation_id = p_conversation and user_id = (select auth.uid());
$$;
