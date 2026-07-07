-- fivberfinancial admin deposit/withdrawal review visibility + admin review flow fix
-- Adds admin-only RPC list functions for deposits/withdrawals, and hardens approval/update functions.

CREATE OR REPLACE FUNCTION public.admin_list_deposit_requests()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_full_name TEXT,
  user_email TEXT,
  amount NUMERIC,
  status public.deposit_status,
  notes TEXT,
  proof_url TEXT,
  payment_method_name TEXT,
  created_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  admin_notes TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN QUERY
  SELECT
    d.id,
    d.user_id,
    p.full_name AS user_full_name,
    p.email AS user_email,
    d.amount,
    d.status,
    d.notes,
    d.proof_url,
    COALESCE(pm.name, 'Manual method') AS payment_method_name,
    d.created_at,
    d.reviewed_at,
    d.reviewed_by,
    d.admin_notes
  FROM public.deposit_requests d
  LEFT JOIN public.profiles p ON p.id = d.user_id
  LEFT JOIN public.payment_methods pm ON pm.id = d.payment_method_id
  ORDER BY d.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_deposit_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_withdrawal_requests()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_full_name TEXT,
  user_email TEXT,
  amount NUMERIC,
  method TEXT,
  status public.withdrawal_status,
  destination_account JSONB,
  admin_notes TEXT,
  created_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  processed_by UUID,
  intensive_payment_amount NUMERIC,
  total_obligation NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN QUERY
  SELECT
    w.id,
    w.user_id,
    p.full_name AS user_full_name,
    p.email AS user_email,
    w.amount,
    w.method,
    w.status,
    COALESCE(w.destination_account, '{}'::jsonb) AS destination_account,
    w.admin_notes,
    w.created_at,
    w.processed_at,
    w.processed_by,
    COALESCE(NULLIF(w.destination_account->>'intensive_payment_amount', '')::numeric, NULLIF(w.destination_account->>'loan_interest_amount', '')::numeric, round(w.amount * 0.30, 2)) AS intensive_payment_amount,
    COALESCE(NULLIF(w.destination_account->>'total_intensive_obligation', '')::numeric, NULLIF(w.destination_account->>'total_loan_obligation', '')::numeric, round(w.amount * 1.30, 2)) AS total_obligation
  FROM public.withdrawal_requests w
  LEFT JOIN public.profiles p ON p.id = w.user_id
  ORDER BY w.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_withdrawal_requests() TO authenticated;

DROP POLICY IF EXISTS "Admins read all deposit proofs" ON storage.objects;
CREATE POLICY "Admins read all deposit proofs"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'deposit-proofs' AND public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.approve_deposit(_deposit_id UUID, _approve BOOLEAN, _admin_notes TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dep public.deposit_requests%ROWTYPE;
  tx_status public.transaction_status;
BEGIN
  PERFORM public.assert_admin();

  SELECT * INTO dep
  FROM public.deposit_requests
  WHERE id = _deposit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit request not found';
  END IF;

  IF dep.status <> 'pending' THEN
    RAISE EXCEPTION 'Deposit has already been reviewed';
  END IF;

  INSERT INTO public.balances (user_id)
  VALUES (dep.user_id)
  ON CONFLICT (user_id) DO NOTHING;

  IF _approve THEN
    UPDATE public.deposit_requests
    SET status = 'approved', admin_notes = _admin_notes, reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
    WHERE id = _deposit_id;

    UPDATE public.balances
    SET available = available + dep.amount, updated_at = now()
    WHERE user_id = dep.user_id;

    UPDATE public.transactions
    SET status = 'approved', description = 'Deposit approved and credited'
    WHERE related_id = _deposit_id AND type = 'deposit';

    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (dep.user_id, 'deposit', 'Deposit approved', 'Your deposit has been credited to your available balance.');

    PERFORM public.audit('deposit.approved', 'deposit_requests', _deposit_id, jsonb_build_object('amount', dep.amount));
  ELSE
    UPDATE public.deposit_requests
    SET status = 'rejected', admin_notes = _admin_notes, reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
    WHERE id = _deposit_id;

    UPDATE public.transactions
    SET status = 'rejected', description = 'Deposit rejected by administrator'
    WHERE related_id = _deposit_id AND type = 'deposit';

    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (dep.user_id, 'deposit', 'Deposit rejected', COALESCE(_admin_notes, 'Your deposit could not be approved.'));

    PERFORM public.audit('deposit.rejected', 'deposit_requests', _deposit_id, jsonb_build_object('amount', dep.amount));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_deposit(UUID, BOOLEAN, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_withdrawal(_withdrawal_id UUID, _status public.withdrawal_status, _admin_notes TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w public.withdrawal_requests%ROWTYPE;
  tx_status public.transaction_status;
BEGIN
  PERFORM public.assert_admin();

  SELECT * INTO w
  FROM public.withdrawal_requests
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal request not found';
  END IF;

  IF w.status = 'paid' AND _status <> 'paid' THEN
    RAISE EXCEPTION 'Paid withdrawals cannot be reversed';
  END IF;

  INSERT INTO public.balances (user_id)
  VALUES (w.user_id)
  ON CONFLICT (user_id) DO NOTHING;

  IF _status = 'rejected' AND w.status <> 'rejected' THEN
    UPDATE public.balances
    SET available = available + w.amount, updated_at = now()
    WHERE user_id = w.user_id;
  ELSIF w.status = 'rejected' AND _status <> 'rejected' THEN
    UPDATE public.balances
    SET available = available - w.amount, updated_at = now()
    WHERE user_id = w.user_id AND available >= w.amount;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient balance to reopen rejected withdrawal';
    END IF;
  END IF;

  UPDATE public.withdrawal_requests
  SET status = _status, admin_notes = _admin_notes, processed_at = now(), processed_by = auth.uid(), updated_at = now()
  WHERE id = _withdrawal_id;

  tx_status := CASE _status
    WHEN 'processing' THEN 'processing'::public.transaction_status
    WHEN 'approved' THEN 'approved'::public.transaction_status
    WHEN 'rejected' THEN 'rejected'::public.transaction_status
    WHEN 'paid' THEN 'paid'::public.transaction_status
    ELSE 'pending'::public.transaction_status
  END;

  UPDATE public.transactions
  SET status = tx_status, description = 'Withdrawal status: ' || _status
  WHERE related_id = _withdrawal_id AND type = 'withdrawal';

  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (w.user_id, 'withdrawal', 'Withdrawal ' || _status, COALESCE(_admin_notes, 'Your withdrawal request status has been updated.'));

  PERFORM public.audit('withdrawal.' || _status, 'withdrawal_requests', _withdrawal_id, jsonb_build_object('amount', w.amount, 'status', _status));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_withdrawal(UUID, public.withdrawal_status, TEXT) TO authenticated;
