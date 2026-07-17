-- fivberfinancial withdrawal receipt + notification read UX support
-- Keeps the strict KYC-before-withdrawal rule and stores the 30% simulation interest details
-- inside withdrawal_requests.destination_account JSONB. No separate loan account is created.

CREATE OR REPLACE FUNCTION public.create_withdrawal(_amount NUMERIC, _method TEXT, _destination_account JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.balances%ROWTYPE;
  _id UUID;
  _interest NUMERIC(18,2);
  _total NUMERIC(18,2);
  _payload JSONB;
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

  _interest := round((_amount * 0.30)::numeric, 2);
  _total := round((_amount + _interest)::numeric, 2);
  _payload := COALESCE(_destination_account, '{}'::jsonb)
    || jsonb_build_object(
      'loan_interest_rate', COALESCE(_destination_account->>'loan_interest_rate', '30%'),
      'loan_interest_amount', COALESCE((_destination_account->>'loan_interest_amount')::numeric, _interest),
      'total_loan_obligation', COALESCE((_destination_account->>'total_loan_obligation')::numeric, _total),
      'simulation_receipt_required', true
    );

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
  VALUES (auth.uid(), _amount, _method, _payload)
  RETURNING id INTO _id;

  INSERT INTO public.transactions (user_id, type, amount, status, reference, description, related_id)
  VALUES (
    auth.uid(),
    'withdrawal',
    _amount,
    'pending',
    _method,
    'Withdrawal request pending with 30% simulation interest receipt',
    _id
  );

  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (
    auth.uid(),
    'withdrawal',
    'Withdrawal request pending',
    'Your withdrawal receipt was accepted. The request is pending admin review with the 30% simulation interest note attached.'
  );

  RETURN _id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_withdrawal(NUMERIC, TEXT, JSONB) TO authenticated;
