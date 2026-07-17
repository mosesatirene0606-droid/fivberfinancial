-- Deposit methods: crypto wallets plus manual account requests.
-- Withdrawal behavior is intentionally unchanged.

UPDATE public.payment_methods
SET active = false, updated_at = now()
WHERE lower(type) IN ('bank', 'bank_transfer', 'mobile_money')
   OR lower(name) IN ('bank transfer', 'mobile money');

INSERT INTO public.payment_methods (name, type, instructions, details, active) VALUES
('Bitcoin Wallet', 'crypto', 'Send Bitcoin to this wallet address, then upload proof of payment.', '{"network":"Bitcoin","currency":"BTC","address":"bc1qc9zjnpwluq4xmt02jfyekturwtmsgdclwfeym9"}'::jsonb, true),
('BNB Wallet', 'crypto', 'Send BNB on BNB Smart Chain to this wallet address, then upload proof of payment.', '{"network":"BNB Smart Chain","currency":"BNB","address":"0xEa9B10f4ea797fd469f98e526C0E358D5faB9De4"}'::jsonb, true),
('Ethereum Wallet', 'crypto', 'Send Ethereum to this wallet address, then upload proof of payment.', '{"network":"Ethereum","currency":"ETH","address":"0xEa9B10f4ea797fd469f98e526C0E358D5faB9De4"}'::jsonb, true),
('Solana Wallet', 'crypto', 'Send Solana to this wallet address, then upload proof of payment.', '{"network":"Solana","currency":"SOL","address":"4HpqwCSQu1MRBZ4VgBxSTMSZ3BKza9mJRK6Cs3atZNoy"}'::jsonb, true),
('Manual Deposit Account', 'manual', 'Request an account from the administrator. Account details will be emailed to your registered email address.', '{}'::jsonb, true)
ON CONFLICT (name) DO UPDATE SET type=EXCLUDED.type, instructions=EXCLUDED.instructions, details=EXCLUDED.details, active=true, updated_at=now();

CREATE TABLE IF NOT EXISTS public.manual_deposit_account_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','emailed','closed')),
  emailed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS manual_deposit_account_requests_user_idx ON public.manual_deposit_account_requests(user_id, created_at DESC);
ALTER TABLE public.manual_deposit_account_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.manual_deposit_account_requests TO authenticated;
GRANT ALL ON public.manual_deposit_account_requests TO service_role;

DROP POLICY IF EXISTS "Users read own manual account requests" ON public.manual_deposit_account_requests;
CREATE POLICY "Users read own manual account requests" ON public.manual_deposit_account_requests FOR SELECT TO authenticated USING (auth.uid()=user_id OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.request_manual_deposit_account() RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT id INTO _id FROM public.manual_deposit_account_requests WHERE user_id=auth.uid() AND status IN ('requested','emailed') ORDER BY created_at DESC LIMIT 1;
  IF _id IS NOT NULL THEN RETURN _id; END IF;
  INSERT INTO public.manual_deposit_account_requests(user_id) VALUES(auth.uid()) RETURNING id INTO _id;
  INSERT INTO public.notifications(user_id,type,title,body) VALUES(auth.uid(),'deposit','Deposit account requested','Your request was sent. Account details will be emailed to your registered email address.');
  RETURN _id;
END $$;
GRANT EXECUTE ON FUNCTION public.request_manual_deposit_account() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_manual_deposit_account_requests()
RETURNS TABLE(id UUID,user_id UUID,user_full_name TEXT,user_email TEXT,status TEXT,created_at TIMESTAMPTZ,emailed_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY SELECT r.id,r.user_id,p.full_name,p.email,r.status,r.created_at,r.emailed_at FROM public.manual_deposit_account_requests r LEFT JOIN public.profiles p ON p.id=r.user_id ORDER BY r.created_at DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_list_manual_deposit_account_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_mark_manual_account_emailed(_request_id UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.manual_deposit_account_requests%ROWTYPE;
BEGIN
  PERFORM public.assert_admin();
  SELECT * INTO r FROM public.manual_deposit_account_requests WHERE id=_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account request not found'; END IF;
  UPDATE public.manual_deposit_account_requests SET status='emailed',emailed_at=now(),updated_at=now() WHERE id=_request_id;
  INSERT INTO public.notifications(user_id,type,title,body) VALUES(r.user_id,'deposit','Deposit account details sent','The administrator has sent the deposit account details to your registered email.');
END $$;
GRANT EXECUTE ON FUNCTION public.admin_mark_manual_account_emailed(UUID) TO authenticated;
