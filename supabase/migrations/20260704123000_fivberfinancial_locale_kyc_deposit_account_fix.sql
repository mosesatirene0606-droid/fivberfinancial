-- fivberfinancial locale/KYC/deposit-account production workflow fix
-- Adds country localization fields, per-user deposit accounts, and robust admin KYC approval.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'US',
  ADD COLUMN IF NOT EXISTS country_name TEXT DEFAULT 'United States',
  ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'en-US',
  ADD COLUMN IF NOT EXISTS phone_country_code TEXT DEFAULT '+1';

CREATE TABLE IF NOT EXISTS public.user_deposit_accounts (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL DEFAULT 'Fivber Financial Bank',
  account_name TEXT NOT NULL DEFAULT 'fivberfinancial',
  account_number TEXT NOT NULL UNIQUE,
  bank_code TEXT NOT NULL DEFAULT 'FIVB123XXX',
  reference_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_deposit_accounts TO authenticated;
GRANT ALL ON public.user_deposit_accounts TO service_role;
ALTER TABLE public.user_deposit_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own deposit account" ON public.user_deposit_accounts;
CREATE POLICY "Users read own deposit account"
ON public.user_deposit_accounts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.generate_account_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  candidate TEXT;
BEGIN
  LOOP
    candidate := lpad((floor(random() * 10000000000))::bigint::text, 10, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.user_deposit_accounts WHERE account_number = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_deposit_account(_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_row public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO profile_row FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.user_deposit_accounts (user_id, account_name, account_number, reference_code)
  VALUES (
    _user_id,
    COALESCE(NULLIF(profile_row.full_name, ''), NULLIF(profile_row.email, ''), 'fivberfinancial'),
    public.generate_account_number(),
    'FIV-' || upper(substr(replace(_user_id::text, '-', ''), 1, 8))
  )
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_profile_deposit_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_user_deposit_account(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_deposit_account ON public.profiles;
CREATE TRIGGER on_profile_deposit_account
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.create_profile_deposit_account();

SELECT public.ensure_user_deposit_account(id) FROM public.profiles;

CREATE OR REPLACE FUNCTION public.get_my_deposit_account()
RETURNS TABLE (
  bank_name TEXT,
  account_name TEXT,
  account_number TEXT,
  bank_code TEXT,
  reference_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  PERFORM public.ensure_user_deposit_account(auth.uid());

  RETURN QUERY
  SELECT uda.bank_name, uda.account_name, uda.account_number, uda.bank_code, uda.reference_code
  FROM public.user_deposit_accounts uda
  WHERE uda.user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_deposit_account() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_kyc_submissions()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_full_name TEXT,
  user_email TEXT,
  status public.kyc_status,
  proof_of_address TEXT,
  document_urls JSONB,
  admin_notes TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN QUERY
  SELECT
    k.id,
    k.user_id,
    COALESCE(p.full_name, au.email) AS user_full_name,
    COALESCE(p.email, au.email) AS user_email,
    k.status,
    k.proof_of_address,
    COALESCE(k.document_urls, '{}'::jsonb) AS document_urls,
    k.admin_notes,
    k.submitted_at,
    k.reviewed_at,
    k.reviewed_by
  FROM public.kyc_submissions k
  LEFT JOIN public.profiles p ON p.id = k.user_id
  LEFT JOIN auth.users au ON au.id = k.user_id
  ORDER BY k.submitted_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_kyc_submissions() TO authenticated;

CREATE OR REPLACE FUNCTION public.review_kyc(_kyc_id UUID, _status public.kyc_status, _admin_notes TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k public.kyc_submissions%ROWTYPE;
  admin_email TEXT;
BEGIN
  PERFORM public.assert_admin();

  SELECT email INTO admin_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.profiles (id, email, full_name, must_change_password, status)
  VALUES (auth.uid(), admin_email, COALESCE(admin_email, 'Administrator'), false, 'active')
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(public.profiles.email, EXCLUDED.email),
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    status = 'active';

  SELECT * INTO k FROM public.kyc_submissions WHERE id = _kyc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'KYC submission not found';
  END IF;

  UPDATE public.kyc_submissions
  SET status = _status,
      admin_notes = _admin_notes,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  WHERE id = _kyc_id;

  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (
    k.user_id,
    'kyc',
    CASE WHEN _status = 'approved' THEN 'KYC approved' WHEN _status = 'rejected' THEN 'KYC rejected' ELSE 'KYC updated' END,
    COALESCE(_admin_notes, CASE WHEN _status = 'approved' THEN 'Your KYC has been approved. Withdrawals and investment activation are now unlocked.' ELSE 'Your KYC status has been updated.' END)
  );

  PERFORM public.audit('kyc.reviewed', 'kyc_submissions', _kyc_id, jsonb_build_object('status', _status));
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_kyc(UUID, public.kyc_status, TEXT) TO authenticated;

DROP POLICY IF EXISTS "Admins read all kyc documents" ON storage.objects;
CREATE POLICY "Admins read all kyc documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'kyc-documents' AND public.has_role(auth.uid(), 'admin'));
