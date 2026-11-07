create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  free_day date not null default ((now() at time zone 'Asia/Bangkok')::date),
  free_used integer not null default 0,
  pro_month text not null default to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM'),
  pro_used integer not null default 0,
  pack_credits integer not null default 0,
  is_pro boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;
alter table public.user_profiles enable row level security;
create policy "Users read own profile" on public.user_profiles
  for select to authenticated using (auth.uid() = id);

create or replace function public.handle_new_user_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

create or replace function public.task_credit_cost(_kind text, _units integer)
returns integer language sql immutable set search_path = public as $$
  select case _kind
    when 'customer' then 1
    when 'quotation' then 2 + greatest(coalesce(_units, 1) - 1, 0) / 10
    when 'document' then 2
    when 'excel' then 3 + greatest(coalesce(_units, 0), 0) / 1000
    else 20
  end;
$$;

create or replace function public.my_credits()
returns table (free integer, monthly integer, pack integer, total integer, is_pro boolean)
language plpgsql security definer set search_path = public as $$
declare
  p public.user_profiles;
  today date := (now() at time zone 'Asia/Bangkok')::date;
  mon text := to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM');
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.user_profiles (id, email)
    select auth.uid(), (select u.email from auth.users u where u.id = auth.uid())
    on conflict (id) do nothing;
  update public.user_profiles set
    free_used = case when free_day = today then free_used else 0 end,
    free_day = today,
    pro_used = case when pro_month = mon then pro_used else 0 end,
    pro_month = mon
  where id = auth.uid() and (free_day <> today or pro_month <> mon);
  select * into p from public.user_profiles where id = auth.uid();
  free := greatest(0, 250 - p.free_used);
  monthly := case when p.is_pro then greatest(0, 25000 - p.pro_used) else 0 end;
  pack := p.pack_credits;
  total := free + monthly + pack;
  is_pro := p.is_pro;
  return next;
end; $$;

create or replace function public.spend_credits(_kind text, _units integer default 0)
returns table (cost integer, free integer, monthly integer, pack integer, total integer, is_pro boolean)
language plpgsql security definer set search_path = public as $$
declare
  b record;
  c integer := public.task_credit_cost(_kind, _units);
  left_ integer;
  f integer; m integer;
begin
  select * into b from public.my_credits();
  if b.total < c then raise exception 'insufficient_credits'; end if;
  left_ := c;
  f := least(left_, b.free); left_ := left_ - f;
  m := least(left_, b.monthly); left_ := left_ - m;
  update public.user_profiles set
    free_used = free_used + f,
    pro_used = pro_used + m,
    pack_credits = pack_credits - left_,
    updated_at = now()
  where id = auth.uid();
  cost := c;
  free := b.free - f; monthly := b.monthly - m; pack := b.pack - left_;
  total := free + monthly + pack; is_pro := b.is_pro;
  return next;
end; $$;

revoke execute on function public.my_credits() from public, anon;
revoke execute on function public.spend_credits(text, integer) from public, anon;
grant execute on function public.my_credits() to authenticated;
grant execute on function public.spend_credits(text, integer) to authenticated;
grant execute on function public.task_credit_cost(text, integer) to authenticated, anon;