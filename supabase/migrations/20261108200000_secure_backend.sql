-- Secure backend foundation for Stepwise Command Center.
-- Apply with: supabase db push (after linking the intended project).
-- Task/file contents are deliberately NOT stored in Postgres.

begin;

-- Account and entitlement metadata only.
alter table public.user_profiles
  add column if not exists trial_ends_at timestamptz,
  add column if not exists trial_started_at timestamptz;

update public.user_profiles
set trial_started_at = coalesce(trial_started_at, created_at),
    trial_ends_at = coalesce(trial_ends_at, created_at + interval '14 days');

alter table public.user_profiles
  alter column trial_started_at set default now(),
  alter column trial_started_at set not null,
  alter column trial_ends_at set default (now() + interval '14 days'),
  alter column trial_ends_at set not null;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'manual' check (length(provider) between 1 and 40),
  provider_subscription_id text,
  plan_key text not null check (length(plan_key) between 1 and 80),
  status text not null check (status in ('trialing','active','past_due','canceled','incomplete','paused','expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id),
  check (current_period_end is null or current_period_start is null or current_period_end > current_period_start)
);
create index if not exists subscriptions_user_status_idx on public.subscriptions (user_id, status, current_period_end desc);

-- Append-only audit trail. Values contain counts/costs/codes only, never task input or file data.
create table if not exists public.credits_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  credit_delta integer not null check (credit_delta <> 0),
  bucket text not null check (bucket in ('free','monthly','pack','adjustment')),
  entry_type text not null check (entry_type in ('usage','pack_purchase','admin_adjustment','refund')),
  task_kind text,
  request_id uuid,
  reference_id text,
  created_at timestamptz not null default now(),
  check (task_kind is null or task_kind in ('customer','quotation','document','excel','other'))
);
create index if not exists credits_ledger_user_created_idx on public.credits_ledger (user_id, created_at desc);
create unique index if not exists credits_ledger_request_bucket_uidx
  on public.credits_ledger (user_id, request_id, bucket) where request_id is not null;
create unique index if not exists credits_ledger_pack_reference_uidx
  on public.credits_ledger (user_id, reference_id) where entry_type = 'pack_purchase' and reference_id is not null;

-- Operational metadata only. Never put task payloads, rows, file names, or cell contents here.
create table if not exists public.task_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_type text not null check (task_type in ('customer','quotation','document','excel','other')),
  status text not null check (status in ('accepted','succeeded','failed','cancelled')),
  credits_spent integer not null default 0 check (credits_spent >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_.-]{1,80}$'),
  created_at timestamptz not null default now()
);
create index if not exists task_logs_user_created_idx on public.task_logs (user_id, created_at desc);

-- GitHub OAuth credentials are AES-GCM ciphertext created in an Edge Function.
-- These tables have RLS but intentionally no client policies/grants.
create table if not exists public.github_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  github_user_id bigint not null,
  github_login text not null check (length(github_login) between 1 and 100),
  access_token_ciphertext text not null,
  access_token_iv text not null,
  repository_id bigint,
  repository_full_name text,
  repository_default_branch text,
  granted_scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.github_oauth_states (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists github_oauth_states_expiry_idx on public.github_oauth_states (expires_at);
create table if not exists public.github_backup_tombstones (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id uuid not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, record_id)
);
create index if not exists github_backup_tombstones_expiry_idx on public.github_backup_tombstones (deleted_at);

alter table public.user_profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credits_ledger enable row level security;
alter table public.task_logs enable row level security;
alter table public.github_connections enable row level security;
alter table public.github_oauth_states enable row level security;
alter table public.github_backup_tombstones enable row level security;

-- Re-establish the existing read-own profile policy, but never allow client balance edits.
drop policy if exists "Users read own profile" on public.user_profiles;
create policy "Users read own profile" on public.user_profiles
  for select to authenticated using (auth.uid() = id);
revoke insert, update, delete, truncate, references, trigger on public.user_profiles from anon, authenticated;
grant select on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;

create policy "Users read own subscriptions" on public.subscriptions
  for select to authenticated using (auth.uid() = user_id);
create policy "Users read own credit ledger" on public.credits_ledger
  for select to authenticated using (auth.uid() = user_id);
create policy "Users read own task logs" on public.task_logs
  for select to authenticated using (auth.uid() = user_id);
create policy "Users create own metadata task logs" on public.task_logs
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users delete own task logs" on public.task_logs
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.subscriptions, public.credits_ledger, public.task_logs,
  public.github_connections, public.github_oauth_states from anon;
revoke all on public.github_backup_tombstones from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.subscriptions,
  public.credits_ledger, public.github_connections, public.github_oauth_states from authenticated;
grant select on public.subscriptions, public.credits_ledger, public.task_logs to authenticated;
grant insert, delete on public.task_logs to authenticated;
grant all on public.subscriptions, public.credits_ledger, public.task_logs,
  public.github_connections, public.github_oauth_states to service_role;
grant all on public.github_backup_tombstones to service_role;

-- Keep updated_at reliable when provider/admin metadata changes.
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();
drop trigger if exists github_connections_set_updated_at on public.github_connections;
create trigger github_connections_set_updated_at before update on public.github_connections
  for each row execute function public.set_updated_at();

-- New accounts start with the free tier, zero usage and a documented 14-day trial window.
create or replace function public.handle_new_user_profile()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  insert into public.user_profiles (id, email, trial_started_at, trial_ends_at)
  values (new.id, new.email, now(), now() + interval '14 days')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create or replace function public.task_credit_cost(_kind text, _units integer)
returns integer language plpgsql immutable set search_path = pg_catalog, public as $$
declare
  u integer := greatest(coalesce(_units, 0), 0);
begin
  if u > 10000000 then raise exception 'invalid_units'; end if;
  return case _kind
    when 'customer' then 1
    when 'quotation' then 2 + greatest(u - 1, 0) / 10
    when 'document' then 2
    when 'excel' then 3 + u / 1000
    else 20
  end;
end;
$$;

-- Used by the UI after sign-in. The profile row lock serializes resets with charges.
create or replace function public.my_credits()
returns table (free integer, monthly integer, pack integer, total integer, is_pro boolean)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  p public.user_profiles%rowtype;
  today date := (now() at time zone 'Asia/Bangkok')::date;
  mon text := to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM');
  entitled boolean;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.user_profiles (id, email)
    select auth.uid(), u.email from auth.users u where u.id = auth.uid()
    on conflict (id) do nothing;
  select * into p from public.user_profiles where id = auth.uid() for update;
  select (coalesce(p.trial_ends_at > now(), false) or exists (
    select 1 from public.subscriptions s
    where s.user_id = p.id
      and (s.status in ('active','trialing') or (s.status = 'canceled' and s.cancel_at_period_end))
      and (s.current_period_end is null or s.current_period_end > now())
  )) into entitled;
  update public.user_profiles set
    free_used = case when free_day = today then free_used else 0 end,
    free_day = today,
    pro_used = case when pro_month = mon then pro_used else 0 end,
    pro_month = mon,
    is_pro = entitled,
    updated_at = now()
  where id = p.id
  returning * into p;
  free := greatest(0, 250 - p.free_used);
  monthly := case when entitled then greatest(0, 25000 - p.pro_used) else 0 end;
  pack := p.pack_credits;
  total := free + monthly + pack;
  is_pro := entitled;
  return next;
end;
$$;

-- Atomic charge: lock profile, validate server-side price/entitlement, update and audit together.
-- _request_id makes retries safe; pass a new UUID for each logical run.
drop function if exists public.spend_credits(text, integer);
create or replace function public.spend_credits(_kind text, _units integer default 0, _request_id uuid default null)
returns table (cost integer, free integer, monthly integer, pack integer, total integer, is_pro boolean)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  p public.user_profiles%rowtype;
  c integer := public.task_credit_cost(_kind, _units);
  today date := (now() at time zone 'Asia/Bangkok')::date;
  mon text := to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM');
  entitled boolean;
  free_before integer;
  monthly_before integer;
  pack_before integer;
  take_free integer;
  take_monthly integer;
  take_pack integer;
  previous_cost integer;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.user_profiles (id, email)
    select auth.uid(), u.email from auth.users u where u.id = auth.uid()
    on conflict (id) do nothing;
  select * into p from public.user_profiles where id = auth.uid() for update;

  -- A per-user row lock prevents concurrent requests from overspending or double charging.
  if _request_id is not null then
    select -sum(credit_delta) into previous_cost from public.credits_ledger
    where user_id = p.id and request_id = _request_id and entry_type = 'usage';
    if previous_cost is not null then
      select * into p from public.user_profiles where id = p.id;
      entitled := coalesce(p.trial_ends_at > now(), false) or exists (
        select 1 from public.subscriptions s where s.user_id = p.id
          and (s.status in ('active','trialing') or (s.status = 'canceled' and s.cancel_at_period_end))
          and (s.current_period_end is null or s.current_period_end > now())
      );
      free := greatest(0, 250 - case when p.free_day = today then p.free_used else 0 end);
      monthly := case when entitled then greatest(0, 25000 - case when p.pro_month = mon then p.pro_used else 0 end) else 0 end;
      pack := p.pack_credits; total := free + monthly + pack; is_pro := entitled; cost := previous_cost;
      return next; return;
    end if;
  end if;

  entitled := coalesce(p.trial_ends_at > now(), false) or exists (
    select 1 from public.subscriptions s where s.user_id = p.id
      and (s.status in ('active','trialing') or (s.status = 'canceled' and s.cancel_at_period_end))
      and (s.current_period_end is null or s.current_period_end > now())
  );
  if p.free_day <> today then p.free_used := 0; end if;
  if p.pro_month <> mon then p.pro_used := 0; end if;
  free_before := greatest(0, 250 - p.free_used);
  monthly_before := case when entitled then greatest(0, 25000 - p.pro_used) else 0 end;
  pack_before := p.pack_credits;
  if free_before + monthly_before + pack_before < c then raise exception 'insufficient_credits'; end if;
  take_free := least(c, free_before);
  take_monthly := least(c - take_free, monthly_before);
  take_pack := c - take_free - take_monthly;

  update public.user_profiles set
    free_day = today, free_used = p.free_used + take_free,
    pro_month = mon, pro_used = p.pro_used + take_monthly,
    pack_credits = pack_before - take_pack, is_pro = entitled, updated_at = now()
  where id = p.id returning * into p;

  if take_free > 0 then
    insert into public.credits_ledger(user_id, credit_delta, bucket, entry_type, task_kind, request_id)
    values (p.id, -take_free, 'free', 'usage', case when _kind in ('customer','quotation','document','excel') then _kind else 'other' end, _request_id);
  end if;
  if take_monthly > 0 then
    insert into public.credits_ledger(user_id, credit_delta, bucket, entry_type, task_kind, request_id)
    values (p.id, -take_monthly, 'monthly', 'usage', case when _kind in ('customer','quotation','document','excel') then _kind else 'other' end, _request_id);
  end if;
  if take_pack > 0 then
    insert into public.credits_ledger(user_id, credit_delta, bucket, entry_type, task_kind, request_id)
    values (p.id, -take_pack, 'pack', 'usage', case when _kind in ('customer','quotation','document','excel') then _kind else 'other' end, _request_id);
  end if;

  cost := c; free := free_before - take_free; monthly := monthly_before - take_monthly;
  pack := pack_before - take_pack; total := free + monthly + pack; is_pro := entitled;
  return next;
end;
$$;

-- Service-role-only grant path; never let a browser mint credits or subscriptions.
create or replace function public.grant_pack_credits(_user_id uuid, _amount integer, _reference_id text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service_role_required'; end if;
  if _amount <= 0 or _amount > 1000000 then raise exception 'invalid_credit_amount'; end if;
  if _reference_id is null or length(_reference_id) = 0 then raise exception 'reference_id_required'; end if;
  insert into public.credits_ledger(user_id, credit_delta, bucket, entry_type, reference_id)
    values (_user_id, _amount, 'pack', 'pack_purchase', left(_reference_id, 200))
    on conflict (user_id, reference_id) where entry_type = 'pack_purchase' and reference_id is not null do nothing;
  if not found then return; end if;
  update public.user_profiles set pack_credits = pack_credits + _amount, updated_at = now()
    where id = _user_id;
  if not found then raise exception 'profile_not_found'; end if;
end;
$$;

-- Consume a one-time state from the OAuth callback. State hashes are not bearer credentials.
create or replace function public.consume_github_oauth_state(_state_hash text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  uid uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service_role_required'; end if;
  delete from public.github_oauth_states
    where state_hash = _state_hash and expires_at > now()
    returning user_id into uid;
  if uid is null then raise exception 'invalid_or_expired_oauth_state'; end if;
  return uid;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user_profile() from public, anon, authenticated;
revoke all on function public.task_credit_cost(text, integer) from public, anon;
revoke all on function public.my_credits() from public, anon;
revoke all on function public.spend_credits(text, integer, uuid) from public, anon;
revoke all on function public.grant_pack_credits(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.consume_github_oauth_state(text) from public, anon, authenticated;
grant execute on function public.my_credits() to authenticated;
grant execute on function public.spend_credits(text, integer, uuid) to authenticated;
grant execute on function public.task_credit_cost(text, integer) to authenticated;
grant execute on function public.grant_pack_credits(uuid, integer, text) to service_role;
grant execute on function public.consume_github_oauth_state(text) to service_role;

commit;
