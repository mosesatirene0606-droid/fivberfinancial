-- fivberfinancial restore KYC-locked withdrawals + keep admin KYC visibility
-- This is intentionally strict: users cannot submit withdrawals until KYC is approved.
-- It also re-creates the admin KYC listing API so admins can review and approve submissions.

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
    p.full_name AS user_full_name,
    p.email AS user_email,
    k.status,
    k.proof_of_address,
    COALESCE(k.document_urls, '{}'::jsonb) AS document_urls,
    k.admin_notes,
    k.submitted_at,
    k.reviewed_at,
    k.reviewed_by
  FROM public.kyc_submissions k
  LEFT JOIN public.profiles p ON p.id = k.user_id
  ORDER BY k.submitted_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_kyc_submissions() TO authenticated;

DROP POLICY IF EXISTS "Admins read all kyc documents" ON storage.objects;
CREATE POLICY "Admins read all kyc documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'kyc-documents' AND public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.create_withdrawal(_amount NUMERIC, _method TEXT, _destination_account JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.balances%ROWTYPE;
  _id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_kyc_approved(auth.uid()) THEN
    RAISE EXCEPTION 'KYC must be approved before withdrawal';
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  IF COALESCE(NULLIF(trim(_method), ''), '') = '' THEN
    RAISE EXCEPTION 'Withdrawal method is required';
  END IF;

  IF COALESCE(_destination_account, '{}'::jsonb) = '{}'::jsonb THEN
    RAISE EXCEPTION 'Destination account is required';
  END IF;

  INSERT INTO public.balances (user_id) VALUES (auth.uid())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO b
  FROM public.balances
  WHERE user_id = auth.uid()
  FOR UPDATE;

  IF b.available < _amount THEN
    RAISE EXCEPTION 'Insufficient available balance';
  END IF;

  UPDATE public.balances
  SET available = available - _amount,
      updated_at = now()
  WHERE user_id = auth.uid();

  INSERT INTO public.withdrawal_requests (user_id, amount, method, destination_account)
  VALUES (auth.uid(), _amount, _method, COALESCE(_destination_account, '{}'::jsonb))
  RETURNING id INTO _id;

  INSERT INTO public.transactions (user_id, type, amount, status, reference, description, related_id)
  VALUES (auth.uid(), 'withdrawal', _amount, 'pending', _method, 'Withdrawal request submitted', _id);

  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (auth.uid(), 'withdrawal', 'Withdrawal request submitted', 'Your withdrawal is pending administrator review.');

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_withdrawal(NUMERIC, TEXT, JSONB) TO authenticated;
