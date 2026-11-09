-- Hybrid backend: encrypted connector handles, scheduled jobs, credit ledger, and trash metadata.

CREATE TABLE public.credits_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  credit_delta integer NOT NULL CHECK (credit_delta <> 0),
  bucket text NOT NULL CHECK (bucket IN ('free','monthly','pack','adjustment')),
  entry_type text NOT NULL CHECK (entry_type IN ('usage','pack_purchase','admin_adjustment','refund')),
  task_kind text CHECK (task_kind IS NULL OR task_kind IN ('customer','quotation','document','excel','other')),
  request_id uuid,
  reference_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credits_ledger TO authenticated;
GRANT ALL ON public.credits_ledger TO service_role;
ALTER TABLE public.credits_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own credit ledger" ON public.credits_ledger
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX credits_ledger_user_created_idx ON public.credits_ledger (user_id, created_at DESC);
CREATE UNIQUE INDEX credits_ledger_request_bucket_uidx
  ON public.credits_ledger (user_id, request_id, bucket) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX credits_ledger_pack_reference_uidx
  ON public.credits_ledger (user_id, reference_id)
  WHERE entry_type = 'pack_purchase' AND reference_id IS NOT NULL;

CREATE TABLE public.app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connector_id text NOT NULL,
  connection_key_ciphertext text NOT NULL,
  reconnect_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);
GRANT ALL ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.github_vaults (
  user_id uuid PRIMARY KEY,
  repository_id bigint,
  repository_full_name text,
  repository_default_branch text NOT NULL DEFAULT 'main',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.github_vaults TO service_role;
ALTER TABLE public.github_vaults ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.github_backup_tombstones (
  user_id uuid NOT NULL,
  record_id uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, record_id)
);
GRANT ALL ON public.github_backup_tombstones TO service_role;
ALTER TABLE public.github_backup_tombstones ENABLE ROW LEVEL SECURITY;
CREATE INDEX github_backup_tombstones_expiry_idx ON public.github_backup_tombstones (deleted_at);

CREATE TABLE public.trash_metadata (
  user_id uuid NOT NULL,
  task_id uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  PRIMARY KEY (user_id, task_id)
);
GRANT ALL ON public.trash_metadata TO service_role;
ALTER TABLE public.trash_metadata ENABLE ROW LEVEL SECURITY;
CREATE INDEX trash_metadata_expiry_idx ON public.trash_metadata (expires_at);

CREATE TABLE public.scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id uuid NOT NULL,
  task_type text NOT NULL CHECK (task_type IN ('customer','quotation','document')),
  task_data jsonb,
  scheduled_for timestamptz NOT NULL,
  webhook_url text NOT NULL,
  webhook_auth_header text,
  webhook_auth_value_ciphertext text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','running','succeeded','failed','cancelled')),
  credits_charged integer NOT NULL DEFAULT 0 CHECK (credits_charged >= 0),
  charged_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (user_id, task_id)
);
GRANT ALL ON public.scheduled_jobs TO service_role;
ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX scheduled_jobs_due_idx ON public.scheduled_jobs (status, scheduled_for);
CREATE INDEX scheduled_jobs_user_idx ON public.scheduled_jobs (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (id) DO UPDATE SET email = excluded.email;
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_credits()
RETURNS TABLE (free integer, monthly integer, pack integer, total integer, is_pro boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  p public.user_profiles%rowtype;
  today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  mon text := to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  INSERT INTO public.user_profiles (id, email)
    SELECT auth.uid(), u.email FROM auth.users u WHERE u.id = auth.uid()
    ON CONFLICT (id) DO NOTHING;
  SELECT * INTO p FROM public.user_profiles WHERE id = auth.uid() FOR UPDATE;
  UPDATE public.user_profiles SET
    free_used = CASE WHEN free_day = today THEN free_used ELSE 0 END,
    free_day = today,
    pro_used = CASE WHEN pro_month = mon THEN pro_used ELSE 0 END,
    pro_month = mon,
    updated_at = now()
  WHERE id = p.id RETURNING * INTO p;
  free := greatest(0, 250 - p.free_used);
  monthly := CASE WHEN p.is_pro THEN greatest(0, 25000 - p.pro_used) ELSE 0 END;
  pack := p.pack_credits;
  total := free + monthly + pack;
  is_pro := p.is_pro;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.charge_credits(_user_id uuid, _kind text, _units integer, _request_id uuid)
RETURNS TABLE (cost integer, free integer, monthly integer, pack integer, total integer, is_pro boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  p public.user_profiles%rowtype;
  c integer := public.task_credit_cost(_kind, _units);
  today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  mon text := to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM');
  free_before integer;
  monthly_before integer;
  pack_before integer;
  take_free integer;
  take_monthly integer;
  take_pack integer;
  previous_cost integer;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_required'; END IF;
  INSERT INTO public.user_profiles (id, email)
    SELECT u.id, u.email FROM auth.users u WHERE u.id = _user_id
    ON CONFLICT (id) DO NOTHING;
  SELECT * INTO p FROM public.user_profiles WHERE id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;

  IF _request_id IS NOT NULL THEN
    SELECT -sum(credit_delta) INTO previous_cost FROM public.credits_ledger
      WHERE user_id = p.id AND request_id = _request_id AND entry_type = 'usage';
    IF previous_cost IS NOT NULL THEN
      free := greatest(0, 250 - CASE WHEN p.free_day = today THEN p.free_used ELSE 0 END);
      monthly := CASE WHEN p.is_pro THEN greatest(0, 25000 - CASE WHEN p.pro_month = mon THEN p.pro_used ELSE 0 END) ELSE 0 END;
      pack := p.pack_credits;
      total := free + monthly + pack;
      is_pro := p.is_pro;
      cost := previous_cost;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  IF p.free_day <> today THEN p.free_used := 0; END IF;
  IF p.pro_month <> mon THEN p.pro_used := 0; END IF;
  free_before := greatest(0, 250 - p.free_used);
  monthly_before := CASE WHEN p.is_pro THEN greatest(0, 25000 - p.pro_used) ELSE 0 END;
  pack_before := p.pack_credits;
  IF free_before + monthly_before + pack_before < c THEN RAISE EXCEPTION 'insufficient_credits'; END IF;
  take_free := least(c, free_before);
  take_monthly := least(c - take_free, monthly_before);
  take_pack := c - take_free - take_monthly;

  UPDATE public.user_profiles SET
    free_day = today, free_used = p.free_used + take_free,
    pro_month = mon, pro_used = p.pro_used + take_monthly,
    pack_credits = pack_before - take_pack, updated_at = now()
  WHERE id = p.id RETURNING * INTO p;

  IF take_free > 0 THEN
    INSERT INTO public.credits_ledger(user_id, credit_delta, bucket, entry_type, task_kind, request_id)
    VALUES (p.id, -take_free, 'free', 'usage', CASE WHEN _kind IN ('customer','quotation','document','excel') THEN _kind ELSE 'other' END, _request_id);
  END IF;
  IF take_monthly > 0 THEN
    INSERT INTO public.credits_ledger(user_id, credit_delta, bucket, entry_type, task_kind, request_id)
    VALUES (p.id, -take_monthly, 'monthly', 'usage', CASE WHEN _kind IN ('customer','quotation','document','excel') THEN _kind ELSE 'other' END, _request_id);
  END IF;
  IF take_pack > 0 THEN
    INSERT INTO public.credits_ledger(user_id, credit_delta, bucket, entry_type, task_kind, request_id)
    VALUES (p.id, -take_pack, 'pack', 'usage', CASE WHEN _kind IN ('customer','quotation','document','excel') THEN _kind ELSE 'other' END, _request_id);
  END IF;

  cost := c;
  free := free_before - take_free;
  monthly := monthly_before - take_monthly;
  pack := pack_before - take_pack;
  total := free + monthly + pack;
  is_pro := p.is_pro;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.spend_credits(_kind text, _units integer DEFAULT 0, _request_id uuid DEFAULT NULL)
RETURNS TABLE (cost integer, free integer, monthly integer, pack integer, total integer, is_pro boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  RETURN QUERY SELECT * FROM public.charge_credits(auth.uid(), _kind, _units, _request_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_scheduled_jobs(_limit integer DEFAULT 3)
RETURNS SETOF public.scheduled_jobs
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH due AS (
    SELECT id FROM public.scheduled_jobs
    WHERE (status = 'scheduled' AND scheduled_for <= now())
       OR (status = 'running' AND locked_at < now() - interval '10 minutes')
    ORDER BY scheduled_for
    FOR UPDATE SKIP LOCKED
    LIMIT least(greatest(_limit, 1), 5)
  )
  UPDATE public.scheduled_jobs j
  SET status = 'running', attempts = j.attempts + 1, locked_at = now(), updated_at = now(), last_error = NULL
  FROM due WHERE j.id = due.id
  RETURNING j.*;
$$;

CREATE OR REPLACE FUNCTION public.spend_scheduled_job_credits(_job_id uuid)
RETURNS TABLE (cost integer, free integer, monthly integer, pack integer, total integer, is_pro boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  j public.scheduled_jobs%rowtype;
  units integer := 0;
BEGIN
  SELECT * INTO j FROM public.scheduled_jobs WHERE id = _job_id AND status = 'running' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scheduled_job_not_claimed'; END IF;
  IF j.charged_at IS NOT NULL THEN
    RETURN QUERY SELECT j.credits_charged, 0, 0, 0, j.credits_charged, false;
    RETURN;
  END IF;
  IF j.task_type = 'quotation' THEN
    units := greatest(jsonb_array_length(COALESCE(j.task_data -> 'items', '[]'::jsonb)), 1);
  END IF;
  RETURN QUERY SELECT * FROM public.charge_credits(j.user_id, j.task_type, units, j.id);
  UPDATE public.scheduled_jobs SET credits_charged = cost, charged_at = now(), updated_at = now() WHERE id = j.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_scheduled_job(_job_id uuid, _status text, _error text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public.scheduled_jobs
  SET status = CASE WHEN _status IN ('succeeded','failed') THEN _status ELSE 'failed' END,
      last_error = left(_error, 500), completed_at = now(), locked_at = NULL, updated_at = now(),
      task_data = NULL, webhook_auth_value_ciphertext = NULL
  WHERE id = _job_id AND status = 'running';
$$;

REVOKE ALL ON FUNCTION public.charge_credits(uuid, text, integer, uuid) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_credits() FROM public, anon;
REVOKE ALL ON FUNCTION public.spend_credits(text, integer, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.claim_scheduled_jobs(integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.spend_scheduled_job_credits(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_scheduled_job(uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_credits() TO authenticated;
GRANT EXECUTE ON FUNCTION public.spend_credits(text, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_scheduled_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.spend_scheduled_job_credits(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_scheduled_job(uuid, text, text) TO service_role;
