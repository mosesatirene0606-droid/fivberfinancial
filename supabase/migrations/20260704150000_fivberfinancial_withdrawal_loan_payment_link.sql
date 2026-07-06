-- fivberfinancial withdrawal 30% loan payment link simulation flow
-- Adds wallet payment methods and records when a user opens a wallet payment instruction.

INSERT INTO public.payment_methods (name, type, instructions, details, active) VALUES
  (
    'Bitcoin Wallet',
    'crypto',
    'Open your Bitcoin wallet. The 30% loan payment amount and reference are attached to this payment link.',
    jsonb_build_object(
      'network', 'Bitcoin',
      'currency', 'BTC',
      'scheme', 'bitcoin',
      'address', 'bc1qc9zjnpwluq4xmt02jfyekturwtmsgdclwfeym9'
    ),
    true
  ),
  (
    'Ethereum Wallet',
    'crypto',
    'Open your Ethereum wallet. The 30% loan payment amount and reference are attached to this payment link.',
    jsonb_build_object(
      'network', 'Ethereum',
      'currency', 'ETH',
      'scheme', 'ethereum',
      'address', '0xEa9B10f4ea797fd469f98e526C0E358D5faB9De4'
    ),
    true
  ),
  (
    'BNB Wallet',
    'crypto',
    'Open your BNB wallet. The 30% loan payment amount and reference are attached to this payment link.',
    jsonb_build_object(
      'network', 'BNB Smart Chain',
      'currency', 'BNB',
      'scheme', 'ethereum',
      'chain_id', 56,
      'address', '0xEa9B10f4ea797fd469f98e526C0E358D5faB9De4'
    ),
    true
  ),
  (
    'Solana Wallet',
    'crypto',
    'Open your Solana wallet. The 30% loan payment amount and reference are attached to this payment link.',
    jsonb_build_object(
      'network', 'Solana',
      'currency', 'SOL',
      'scheme', 'solana',
      'address', '4HpqwCSQu1MRBZ4VgBxSTMSZ3BKza9mJRK6Cs3atZNoy'
    ),
    true
  )
ON CONFLICT (name) DO UPDATE SET
  type = EXCLUDED.type,
  instructions = EXCLUDED.instructions,
  details = EXCLUDED.details,
  active = true,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.withdrawal_payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  withdrawal_id UUID NOT NULL REFERENCES public.withdrawal_requests(id) ON DELETE CASCADE,
  loan_amount NUMERIC(18,2) NOT NULL CHECK (loan_amount > 0),
  wallet_name TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  wallet_uri TEXT NOT NULL,
  reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'wallet_opened',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS withdrawal_payment_intents_user_idx ON public.withdrawal_payment_intents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS withdrawal_payment_intents_withdrawal_idx ON public.withdrawal_payment_intents(withdrawal_id, created_at DESC);

GRANT SELECT, INSERT ON public.withdrawal_payment_intents TO authenticated;
GRANT ALL ON public.withdrawal_payment_intents TO service_role;
ALTER TABLE public.withdrawal_payment_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own withdrawal payment intents" ON public.withdrawal_payment_intents;
CREATE POLICY "Users read own withdrawal payment intents" ON public.withdrawal_payment_intents
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users create own withdrawal payment intents" ON public.withdrawal_payment_intents;
CREATE POLICY "Users create own withdrawal payment intents" ON public.withdrawal_payment_intents
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS withdrawal_payment_intents_updated_at ON public.withdrawal_payment_intents;
CREATE TRIGGER withdrawal_payment_intents_updated_at
BEFORE UPDATE ON public.withdrawal_payment_intents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.record_withdrawal_payment_intent(
  _withdrawal_id UUID,
  _loan_amount NUMERIC,
  _wallet_name TEXT,
  _wallet_address TEXT,
  _wallet_uri TEXT,
  _reference TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner UUID;
  _intent_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT user_id INTO _owner
  FROM public.withdrawal_requests
  WHERE id = _withdrawal_id;

  IF _owner IS NULL THEN
    RAISE EXCEPTION 'Withdrawal request not found';
  END IF;

  IF _owner <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not allowed to record payment intent for this withdrawal';
  END IF;

  IF _loan_amount IS NULL OR _loan_amount <= 0 THEN
    RAISE EXCEPTION 'Loan payment amount is required';
  END IF;

  IF COALESCE(NULLIF(trim(_wallet_name), ''), '') = '' OR COALESCE(NULLIF(trim(_wallet_address), ''), '') = '' THEN
    RAISE EXCEPTION 'Wallet details are required';
  END IF;

  INSERT INTO public.withdrawal_payment_intents (
    user_id,
    withdrawal_id,
    loan_amount,
    wallet_name,
    wallet_address,
    wallet_uri,
    reference,
    status
  ) VALUES (
    _owner,
    _withdrawal_id,
    round(_loan_amount::numeric, 2),
    _wallet_name,
    _wallet_address,
    _wallet_uri,
    COALESCE(NULLIF(trim(_reference), ''), 'FIVB-LOAN'),
    'wallet_opened'
  )
  RETURNING id INTO _intent_id;

  UPDATE public.withdrawal_requests
  SET destination_account = COALESCE(destination_account, '{}'::jsonb)
    || jsonb_build_object(
      'loan_payment_status', 'wallet_selected',
      'loan_payment_wallet', _wallet_name,
      'loan_payment_wallet_address', _wallet_address,
      'loan_payment_uri', _wallet_uri,
      'loan_payment_reference', COALESCE(NULLIF(trim(_reference), ''), 'FIVB-LOAN'),
      'loan_payment_selected_at', now()
    ),
    updated_at = now()
  WHERE id = _withdrawal_id;

  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (
    _owner,
    'withdrawal',
    'Loan payment wallet selected',
    'Your 30% loan payment instruction was opened for ' || _wallet_name || '. Keep your reference and transaction proof for admin review.'
  );

  RETURN _intent_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_withdrawal_payment_intent(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO authenticated;
