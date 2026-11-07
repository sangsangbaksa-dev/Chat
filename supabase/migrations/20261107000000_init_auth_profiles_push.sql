-- 왈도쳇 초기 스키마: 프로필, 계정 중복 방지, 푸시 구독

-- 1) 이메일 정규화 (gmail의 점/+별칭/googlemail 도메인 통일)
create or replace function public.normalize_email(raw text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  local_part text;
  domain_part text;
begin
  raw := lower(btrim(raw));
  if raw is null or position('@' in raw) = 0 then
    return raw;
  end if;
  local_part := split_part(raw, '@', 1);
  domain_part := split_part(raw, '@', 2);
  if domain_part = 'googlemail.com' then
    domain_part := 'gmail.com';
  end if;
  if domain_part = 'gmail.com' then
    local_part := split_part(local_part, '+', 1);
    local_part := replace(local_part, '.', '');
  end if;
  return local_part || '@' || domain_part;
end;
$$;

-- 2) 차단 도메인 (일회용 메일 등) — 클라이언트에서는 접근 불가
create table public.blocked_email_domains (
  domain text primary key
);
alter table public.blocked_email_domains enable row level security;

insert into public.blocked_email_domains (domain) values
  ('mailinator.com'), ('guerrillamail.com'), ('10minutemail.com'), ('tempmail.com'),
  ('temp-mail.org'), ('yopmail.com'), ('trashmail.com'), ('sharklasers.com'),
  ('getnada.com'), ('throwawaymail.com'), ('maildrop.cc'), ('dispostable.com')
on conflict do nothing;

-- 3) 본인 확인용 정규화 이메일 (유니크) — 정책 없음 = 클라이언트 접근 불가
create table public.account_identities (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email_normalized text not null unique,
  created_at timestamptz not null default now()
);
alter table public.account_identities enable row level security;

-- 4) 프로필 (대화 상대에게 보이는 공개 정보)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- 5) 가입 시: 차단 도메인 거부 + 정규화 이메일 중복 거부 + 프로필 생성
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

  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
             nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
             split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 6) 푸시 구독
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;

create policy "push_select_own" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "push_delete_own" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));
-- insert/update는 아래 RPC로만 (공유 기기에서 구독이 다른 계정으로 넘어오는 경우 처리)

create or replace function public.register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 200))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh,
        auth = excluded.auth, user_agent = excluded.user_agent;
end;
$$;

revoke execute on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;
