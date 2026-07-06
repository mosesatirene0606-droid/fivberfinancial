-- fivberfinancial full investment/brokerage schema
-- Adds KYC, plans, deposits, withdrawals, transactions, CMS/settings, audit logs, storage buckets, and server-side finance RPCs.

CREATE TYPE public.kyc_status AS ENUM ('pending', 'under_review', 'approved', 'rejected', 'resubmission_requested');
CREATE TYPE public.deposit_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.withdrawal_status AS ENUM ('pending', 'processing', 'approved', 'rejected', 'paid');
CREATE TYPE public.investment_status AS ENUM ('active', 'completed', 'expired', 'cancelled');
CREATE TYPE public.transaction_type AS ENUM ('deposit', 'investment', 'daily_profit', 'withdrawal', 'bonus', 'adjustment', 'fee');
CREATE TYPE public.transaction_status AS ENUM ('pending', 'processing', 'approved', 'rejected', 'completed', 'paid');

-- PAYMENT METHODS
CREATE TABLE public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'bank',
  instructions TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read active payment methods" ON public.payment_methods FOR SELECT TO authenticated USING (active OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage payment methods" ON public.payment_methods FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER payment_methods_updated_at BEFORE UPDATE ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- INVESTMENT PLANS
CREATE TABLE public.investment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  min_amount NUMERIC(18,2) NOT NULL CHECK (min_amount > 0),
  max_amount NUMERIC(18,2) CHECK (max_amount IS NULL OR max_amount >= min_amount),
  daily_roi_percent NUMERIC(8,4) NOT NULL CHECK (daily_roi_percent >= 0),
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.investment_plans TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.investment_plans TO authenticated;
GRANT ALL ON public.investment_plans TO service_role;
ALTER TABLE public.investment_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read active plans" ON public.investment_plans FOR SELECT TO authenticated USING (active OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage plans" ON public.investment_plans FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER investment_plans_updated_at BEFORE UPDATE ON public.investment_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- KYC
CREATE TABLE public.kyc_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.kyc_status NOT NULL DEFAULT 'pending',
  document_urls JSONB NOT NULL DEFAULT '{}'::jsonb,
  proof_of_address TEXT,
  notes TEXT,
  admin_notes TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX kyc_submissions_user_idx ON public.kyc_submissions(user_id, submitted_at DESC);
GRANT SELECT, INSERT ON public.kyc_submissions TO authenticated;
GRANT UPDATE ON public.kyc_submissions TO authenticated;
GRANT ALL ON public.kyc_submissions TO service_role;
ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own kyc" ON public.kyc_submissions FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users submit own kyc" ON public.kyc_submissions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins update kyc" ON public.kyc_submissions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER kyc_submissions_updated_at BEFORE UPDATE ON public.kyc_submissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- USER INVESTMENTS
CREATE TABLE public.user_investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.investment_plans(id) ON DELETE SET NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  daily_roi_percent NUMERIC(8,4) NOT NULL,
  duration_days INTEGER NOT NULL,
  accrued_profit NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_expected_profit NUMERIC(18,2) NOT NULL DEFAULT 0,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  maturity_date DATE NOT NULL,
  last_profit_date DATE,
  status public.investment_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX user_investments_user_idx ON public.user_investments(user_id, created_at DESC);
GRANT SELECT ON public.user_investments TO authenticated;
GRANT UPDATE ON public.user_investments TO authenticated;
GRANT ALL ON public.user_investments TO service_role;
ALTER TABLE public.user_investments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own investments" ON public.user_investments FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update investments" ON public.user_investments FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER user_investments_updated_at BEFORE UPDATE ON public.user_investments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- DEPOSITS
CREATE TABLE public.deposit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  proof_url TEXT,
  status public.deposit_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  admin_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX deposit_requests_user_idx ON public.deposit_requests(user_id, created_at DESC);
GRANT SELECT ON public.deposit_requests TO authenticated;
GRANT UPDATE ON public.deposit_requests TO authenticated;
GRANT ALL ON public.deposit_requests TO service_role;
ALTER TABLE public.deposit_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own deposits" ON public.deposit_requests FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update deposits" ON public.deposit_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER deposit_requests_updated_at BEFORE UPDATE ON public.deposit_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- WITHDRAWALS
CREATE TABLE public.withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL,
  destination_account JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.withdrawal_status NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX withdrawal_requests_user_idx ON public.withdrawal_requests(user_id, created_at DESC);
GRANT SELECT ON public.withdrawal_requests TO authenticated;
GRANT UPDATE ON public.withdrawal_requests TO authenticated;
GRANT ALL ON public.withdrawal_requests TO service_role;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own withdrawals" ON public.withdrawal_requests FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update withdrawals" ON public.withdrawal_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER withdrawal_requests_updated_at BEFORE UPDATE ON public.withdrawal_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- TRANSACTIONS
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT NOT NULL UNIQUE DEFAULT ('TX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type public.transaction_type NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  status public.transaction_status NOT NULL DEFAULT 'pending',
  reference TEXT,
  description TEXT,
  related_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX transactions_user_idx ON public.transactions(user_id, created_at DESC);
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own transactions" ON public.transactions FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- AUDIT LOGS
CREATE TABLE public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit logs" ON public.admin_audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- CMS AND SETTINGS
CREATE TABLE public.cms_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT,
  published BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cms_pages, public.announcements, public.site_settings TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.cms_pages, public.announcements, public.site_settings TO authenticated;
GRANT ALL ON public.cms_pages, public.announcements, public.site_settings TO service_role;
ALTER TABLE public.cms_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read published pages" ON public.cms_pages FOR SELECT USING (published OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Public read active announcements" ON public.announcements FOR SELECT USING (active OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Public read settings" ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "Admins manage pages" ON public.cms_pages FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage announcements" ON public.announcements FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage settings" ON public.site_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- STORAGE BUCKETS
INSERT INTO storage.buckets (id, name, public) VALUES ('kyc-documents', 'kyc-documents', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('deposit-proofs', 'deposit-proofs', false) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Users upload own kyc documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users read own kyc documents" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'kyc-documents' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "Users upload own deposit proofs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'deposit-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users read own deposit proofs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'deposit-proofs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));

-- HELPERS
CREATE OR REPLACE FUNCTION public.assert_admin()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin privileges required';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_kyc_approved(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kyc_submissions
    WHERE user_id = _user_id AND status = 'approved'
    ORDER BY submitted_at DESC
    LIMIT 1
  );
$$;

CREATE OR REPLACE FUNCTION public.audit(_action TEXT, _entity_type TEXT, _entity_id UUID, _metadata JSONB DEFAULT '{}'::jsonb)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.admin_audit_logs (admin_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), _action, _entity_type, _entity_id, COALESCE(_metadata, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_deposit(_amount NUMERIC, _payment_method_id UUID DEFAULT NULL, _proof_url TEXT DEFAULT NULL, _notes TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  INSERT INTO public.deposit_requests (user_id, payment_method_id, amount, proof_url, notes)
  VALUES (auth.uid(), _payment_method_id, _amount, _proof_url, _notes)
  RETURNING id INTO _id;
  INSERT INTO public.transactions (user_id, type, amount, status, reference, description, related_id)
  VALUES (auth.uid(), 'deposit', _amount, 'pending', _notes, 'Deposit request submitted for admin approval', _id);
  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (auth.uid(), 'deposit', 'Deposit request submitted', 'Your deposit request is pending administrator approval.');
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_deposit(_deposit_id UUID, _approve BOOLEAN, _admin_notes TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  dep public.deposit_requests%ROWTYPE;
BEGIN
  PERFORM public.assert_admin();
  SELECT * INTO dep FROM public.deposit_requests WHERE id = _deposit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deposit request not found'; END IF;
  IF dep.status <> 'pending' THEN RAISE EXCEPTION 'Deposit has already been reviewed'; END IF;

  IF _approve THEN
    UPDATE public.deposit_requests SET status = 'approved', admin_notes = _admin_notes, reviewed_at = now(), reviewed_by = auth.uid() WHERE id = _deposit_id;
    UPDATE public.balances SET available = available + dep.amount, updated_at = now() WHERE user_id = dep.user_id;
    UPDATE public.transactions SET status = 'approved', description = 'Deposit approved and credited' WHERE related_id = _deposit_id AND type = 'deposit';
    INSERT INTO public.notifications (user_id, type, title, body) VALUES (dep.user_id, 'deposit', 'Deposit approved', 'Your deposit has been credited to your available balance.');
    PERFORM public.audit('deposit.approved', 'deposit_requests', _deposit_id, jsonb_build_object('amount', dep.amount));
  ELSE
    UPDATE public.deposit_requests SET status = 'rejected', admin_notes = _admin_notes, reviewed_at = now(), reviewed_by = auth.uid() WHERE id = _deposit_id;
    UPDATE public.transactions SET status = 'rejected', description = 'Deposit rejected by administrator' WHERE related_id = _deposit_id AND type = 'deposit';
    INSERT INTO public.notifications (user_id, type, title, body) VALUES (dep.user_id, 'deposit', 'Deposit rejected', COALESCE(_admin_notes, 'Your deposit could not be approved.'));
    PERFORM public.audit('deposit.rejected', 'deposit_requests', _deposit_id, jsonb_build_object('amount', dep.amount));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_kyc(_kyc_id UUID, _status public.kyc_status, _admin_notes TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k public.kyc_submissions%ROWTYPE;
BEGIN
  PERFORM public.assert_admin();
  SELECT * INTO k FROM public.kyc_submissions WHERE id = _kyc_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KYC submission not found'; END IF;
  UPDATE public.kyc_submissions SET status = _status, admin_notes = _admin_notes, reviewed_at = now(), reviewed_by = auth.uid() WHERE id = _kyc_id;
  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (k.user_id, 'kyc', CASE WHEN _status = 'approved' THEN 'KYC approved' ELSE 'KYC update' END, COALESCE(_admin_notes, 'Your KYC status has been updated.'));
  PERFORM public.audit('kyc.reviewed', 'kyc_submissions', _kyc_id, jsonb_build_object('status', _status));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_investment(_plan_id UUID, _amount NUMERIC)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.investment_plans%ROWTYPE;
  b public.balances%ROWTYPE;
  _id UUID;
  expected NUMERIC(18,2);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_kyc_approved(auth.uid()) THEN RAISE EXCEPTION 'KYC must be approved before investing'; END IF;
  SELECT * INTO p FROM public.investment_plans WHERE id = _plan_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Investment plan is unavailable'; END IF;
  IF _amount < p.min_amount THEN RAISE EXCEPTION 'Amount is below plan minimum'; END IF;
  IF p.max_amount IS NOT NULL AND _amount > p.max_amount THEN RAISE EXCEPTION 'Amount exceeds plan maximum'; END IF;
  SELECT * INTO b FROM public.balances WHERE user_id = auth.uid() FOR UPDATE;
  IF b.available < _amount THEN RAISE EXCEPTION 'Insufficient available balance'; END IF;
  expected := round((_amount * p.daily_roi_percent / 100) * p.duration_days, 2);
  UPDATE public.balances SET available = available - _amount, invested = invested + _amount, updated_at = now() WHERE user_id = auth.uid();
  INSERT INTO public.user_investments (user_id, plan_id, amount, daily_roi_percent, duration_days, total_expected_profit, maturity_date)
  VALUES (auth.uid(), p.id, _amount, p.daily_roi_percent, p.duration_days, expected, CURRENT_DATE + p.duration_days)
  RETURNING id INTO _id;
  INSERT INTO public.transactions (user_id, type, amount, status, reference, description, related_id)
  VALUES (auth.uid(), 'investment', _amount, 'approved', p.name, 'Investment activated', _id);
  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (auth.uid(), 'investment', 'Investment activated', p.name || ' investment plan is now active.');
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_withdrawal(_amount NUMERIC, _method TEXT, _destination_account JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.balances%ROWTYPE;
  _id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_kyc_approved(auth.uid()) THEN RAISE EXCEPTION 'KYC must be approved before withdrawal'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  SELECT * INTO b FROM public.balances WHERE user_id = auth.uid() FOR UPDATE;
  IF b.available < _amount THEN RAISE EXCEPTION 'Insufficient available balance'; END IF;
  UPDATE public.balances SET available = available - _amount, updated_at = now() WHERE user_id = auth.uid();
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

CREATE OR REPLACE FUNCTION public.admin_update_withdrawal(_withdrawal_id UUID, _status public.withdrawal_status, _admin_notes TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w public.withdrawal_requests%ROWTYPE;
  tx_status public.transaction_status;
BEGIN
  PERFORM public.assert_admin();
  SELECT * INTO w FROM public.withdrawal_requests WHERE id = _withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Withdrawal request not found'; END IF;
  IF w.status = 'paid' AND _status <> 'paid' THEN RAISE EXCEPTION 'Paid withdrawals cannot be reversed'; END IF;

  IF _status = 'rejected' AND w.status <> 'rejected' THEN
    UPDATE public.balances SET available = available + w.amount, updated_at = now() WHERE user_id = w.user_id;
  ELSIF w.status = 'rejected' AND _status <> 'rejected' THEN
    UPDATE public.balances SET available = available - w.amount, updated_at = now() WHERE user_id = w.user_id AND available >= w.amount;
    IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient balance to reopen rejected withdrawal'; END IF;
  END IF;

  UPDATE public.withdrawal_requests SET status = _status, admin_notes = _admin_notes, processed_at = now(), processed_by = auth.uid() WHERE id = _withdrawal_id;
  tx_status := CASE _status WHEN 'processing' THEN 'processing' WHEN 'approved' THEN 'approved' WHEN 'rejected' THEN 'rejected' WHEN 'paid' THEN 'paid' ELSE 'pending' END;
  UPDATE public.transactions SET status = tx_status, description = 'Withdrawal status: ' || _status WHERE related_id = _withdrawal_id AND type = 'withdrawal';
  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (w.user_id, 'withdrawal', 'Withdrawal ' || _status, COALESCE(_admin_notes, 'Your withdrawal request status has been updated.'));
  PERFORM public.audit('withdrawal.' || _status, 'withdrawal_requests', _withdrawal_id, jsonb_build_object('amount', w.amount));
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_daily_profit()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv public.user_investments%ROWTYPE;
  profit NUMERIC(18,2);
  count_credited INTEGER := 0;
BEGIN
  FOR inv IN SELECT * FROM public.user_investments WHERE status = 'active' AND (last_profit_date IS NULL OR last_profit_date < CURRENT_DATE) LOOP
    profit := round(inv.amount * inv.daily_roi_percent / 100, 2);
    UPDATE public.user_investments SET accrued_profit = accrued_profit + profit, last_profit_date = CURRENT_DATE, updated_at = now() WHERE id = inv.id;
    UPDATE public.balances SET available = available + profit, total_profit = total_profit + profit, updated_at = now() WHERE user_id = inv.user_id;
    INSERT INTO public.transactions (user_id, type, amount, status, reference, description, related_id)
    VALUES (inv.user_id, 'daily_profit', profit, 'approved', inv.id::text, 'Daily earnings credited', inv.id);
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (inv.user_id, 'earnings', 'Daily earnings credited', 'Your daily profit of ' || profit || ' has been credited.');
    count_credited := count_credited + 1;

    IF CURRENT_DATE >= inv.maturity_date THEN
      UPDATE public.user_investments SET status = 'completed', updated_at = now() WHERE id = inv.id;
      UPDATE public.balances SET invested = GREATEST(invested - inv.amount, 0), available = available + inv.amount, updated_at = now() WHERE user_id = inv.user_id;
      INSERT INTO public.notifications (user_id, type, title, body)
      VALUES (inv.user_id, 'investment', 'Investment matured', 'Your principal has been returned to your available balance.');
    END IF;
  END LOOP;
  RETURN count_credited;
END;
$$;

-- SEED DATA
INSERT INTO public.payment_methods (name, type, instructions, details) VALUES
  ('Bank Transfer', 'bank', 'Transfer to the bank account configured here, then upload proof of payment.', '{"account_name":"fivberfinancial","account_number":"0000000000","bank":"Configure Bank"}'::jsonb),
  ('Cryptocurrency', 'crypto', 'Send to the configured wallet and submit the transaction hash or screenshot.', '{"network":"USDT TRC20","wallet":"Configure wallet address"}'::jsonb),
  ('Mobile Money', 'mobile_money', 'Use the mobile money details configured by the administrator.', '{"provider":"Configure provider","number":"Configure number"}'::jsonb)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.investment_plans (name, description, min_amount, max_amount, daily_roi_percent, duration_days, active) VALUES
  ('Starter', 'Entry plan for verified investors.', 100, 1000, 1.2, 30, true),
  ('Silver', 'Balanced plan for steady portfolio growth.', 1000, 5000, 1.8, 45, true),
  ('Gold', 'Higher-cap plan for experienced investors.', 5000, 20000, 2.5, 60, true),
  ('VIP', 'Premium uncapped brokerage plan.', 20000, NULL, 3.2, 90, true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.site_settings (key, value) VALUES
  ('brand', '{"site_name":"fivberfinancial","currency":"USD","timezone":"UTC","theme":"white-blue-emerald"}'::jsonb),
  ('security', '{"admin_only_user_creation":true,"kyc_required_for_investment":true,"kyc_required_for_withdrawal":true,"two_factor_optional":true}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

INSERT INTO public.cms_pages (slug, title, body) VALUES
  ('about', 'About fivberfinancial', 'Premium investment and brokerage services with verification-first access.'),
  ('faq', 'Frequently Asked Questions', 'Administrators can edit this page from CMS settings.'),
  ('terms', 'Terms of Service', 'Update these terms before launch.'),
  ('privacy', 'Privacy Policy', 'Update this policy before launch.')
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_adjust_balance(_user_id UUID, _amount NUMERIC, _direction TEXT, _transaction_type public.transaction_type DEFAULT 'adjustment', _description TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  delta NUMERIC(18,2);
BEGIN
  PERFORM public.assert_admin();
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF _direction NOT IN ('credit', 'debit') THEN RAISE EXCEPTION 'Direction must be credit or debit'; END IF;
  delta := CASE WHEN _direction = 'credit' THEN _amount ELSE -_amount END;
  IF _direction = 'debit' THEN
    UPDATE public.balances SET available = available + delta, updated_at = now() WHERE user_id = _user_id AND available >= _amount;
    IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient user balance for debit'; END IF;
  ELSE
    UPDATE public.balances SET available = available + delta, updated_at = now() WHERE user_id = _user_id;
  END IF;
  INSERT INTO public.transactions (user_id, type, amount, status, reference, description)
  VALUES (_user_id, _transaction_type, _amount, 'approved', _direction, COALESCE(_description, 'Administrator balance adjustment'));
  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (_user_id, 'system', 'Balance adjusted', COALESCE(_description, 'An administrator adjusted your balance.'));
  PERFORM public.audit('balance.' || _direction, 'balances', _user_id, jsonb_build_object('amount', _amount, 'type', _transaction_type, 'description', _description));
END;
$$;
