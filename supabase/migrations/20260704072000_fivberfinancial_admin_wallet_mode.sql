-- fivberfinancial admin wallet mode hardening
-- This keeps the platform as a working investment/account workflow without in-app real-money settlement.
-- Admin-created users receive a welcome notification, and admin manual balance credits/debits
-- immediately update wallet balance, transactions, notifications, and audit logs.

INSERT INTO public.site_settings (key, value) VALUES
  ('admin_wallet_mode', '{"enabled":true,"description":"Manual admin credits/debits update user balances. No real-money settlement is performed by the app."}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, must_change_password, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, true),
    'active'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    must_change_password = EXCLUDED.must_change_password,
    status = EXCLUDED.status,
    updated_at = now();

  INSERT INTO public.balances (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.account_limits (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_preferences (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (
    NEW.id,
    'system',
    'Welcome to fivberfinancial',
    'Your account has been created. Please sign in and change your temporary password.'
  );

  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(
  _user_id UUID,
  _amount NUMERIC,
  _direction TEXT,
  _transaction_type public.transaction_type DEFAULT 'adjustment',
  _description TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  delta NUMERIC(18,2);
  tx_title TEXT;
  tx_description TEXT;
BEGIN
  PERFORM public.assert_admin();
  IF _user_id IS NULL THEN RAISE EXCEPTION 'User is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN RAISE EXCEPTION 'User profile not found'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF _direction NOT IN ('credit', 'debit') THEN RAISE EXCEPTION 'Direction must be credit or debit'; END IF;

  INSERT INTO public.balances (user_id) VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  delta := CASE WHEN _direction = 'credit' THEN _amount ELSE -_amount END;
  tx_description := COALESCE(NULLIF(trim(_description), ''), CASE WHEN _direction = 'credit' THEN 'Manual wallet credit by administrator' ELSE 'Manual wallet debit by administrator' END);
  tx_title := CASE WHEN _direction = 'credit' THEN 'Balance credited' ELSE 'Balance debited' END;

  IF _direction = 'debit' THEN
    UPDATE public.balances
    SET available = available + delta, updated_at = now()
    WHERE user_id = _user_id AND available >= _amount;
    IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient user balance for debit'; END IF;
  ELSE
    UPDATE public.balances
    SET available = available + delta, updated_at = now()
    WHERE user_id = _user_id;
  END IF;

  INSERT INTO public.transactions (user_id, type, amount, status, reference, description)
  VALUES (_user_id, _transaction_type, _amount, 'completed', 'ADMIN-' || upper(_direction), tx_description);

  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (
    _user_id,
    'system',
    tx_title,
    CASE
      WHEN _direction = 'credit' THEN 'Your account has been credited with ' || trim(to_char(_amount, 'FM999999999999990.00')) || '. Your available balance has increased.'
      ELSE 'Your account has been debited by ' || trim(to_char(_amount, 'FM999999999999990.00')) || '. Your available balance has been updated.'
    END
  );

  PERFORM public.audit(
    'wallet_balance.' || _direction,
    'balances',
    _user_id,
    jsonb_build_object('amount', _amount, 'type', _transaction_type, 'description', tx_description, 'admin_managed', true)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_adjust_balance(UUID, NUMERIC, TEXT, public.transaction_type, TEXT) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_mark_notification_read(_notification_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.notifications
  SET read_at = COALESCE(read_at, now())
  WHERE id = _notification_id AND user_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_mark_notification_read(UUID) TO authenticated;
