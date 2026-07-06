-- fivberfinancial dashboard fintech upgrade
-- Adds dashboard support tables/APIs for withdrawal account setup, referral rewards,
-- account limits, user preferences, support tickets, and richer dashboard data.

CREATE TABLE public.withdrawal_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT 'Bank Transfer',
  bank_name TEXT,
  account_number TEXT,
  account_name TEXT,
  crypto_wallet TEXT,
  mobile_money_number TEXT,
  status TEXT NOT NULL DEFAULT 'not_verified' CHECK (status IN ('not_added', 'not_verified', 'pending_review', 'verified', 'rejected')),
  admin_notes TEXT,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.withdrawal_accounts TO authenticated;
GRANT ALL ON public.withdrawal_accounts TO service_role;
ALTER TABLE public.withdrawal_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own withdrawal account" ON public.withdrawal_accounts FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users upsert own withdrawal account" ON public.withdrawal_accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own unverified withdrawal account" ON public.withdrawal_accounts FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin')) WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER withdrawal_accounts_updated_at BEFORE UPDATE ON public.withdrawal_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.account_limits (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  kyc_level TEXT NOT NULL DEFAULT 'KYC Level 1',
  daily_deposit_limit NUMERIC(18,2) NOT NULL DEFAULT 1000,
  daily_withdrawal_limit NUMERIC(18,2) NOT NULL DEFAULT 0,
  max_active_investments INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.account_limits TO authenticated;
GRANT INSERT, UPDATE ON public.account_limits TO authenticated;
GRANT ALL ON public.account_limits TO service_role;
ALTER TABLE public.account_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own account limits" ON public.account_limits FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage account limits" ON public.account_limits FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER account_limits_updated_at BEFORE UPDATE ON public.account_limits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  hide_balances BOOLEAN NOT NULL DEFAULT false,
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
  dashboard_layout JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own preferences" ON public.user_preferences FOR ALL TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin')) WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER user_preferences_updated_at BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'qualified', 'rejected', 'paid')),
  bonus_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX referrals_referrer_idx ON public.referrals(referrer_id, created_at DESC);
GRANT SELECT ON public.referrals TO authenticated;
GRANT INSERT, UPDATE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own referrals" ON public.referrals FOR SELECT TO authenticated USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage referrals" ON public.referrals FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  admin_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_user_idx ON public.support_tickets(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own support tickets" ON public.support_tickets FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users create support tickets" ON public.support_tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins update support tickets" ON public.support_tickets FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_dashboard_defaults()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.account_limits (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_preferences (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_profile_dashboard_defaults ON public.profiles;
CREATE TRIGGER on_profile_dashboard_defaults
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_dashboard_defaults();

INSERT INTO public.account_limits (user_id)
SELECT id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_preferences (user_id)
SELECT id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.upsert_withdrawal_account(
  _method TEXT,
  _bank_name TEXT DEFAULT NULL,
  _account_number TEXT DEFAULT NULL,
  _account_name TEXT DEFAULT NULL,
  _crypto_wallet TEXT DEFAULT NULL,
  _mobile_money_number TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.withdrawal_accounts (user_id, method, bank_name, account_number, account_name, crypto_wallet, mobile_money_number, status)
  VALUES (auth.uid(), COALESCE(_method, 'Bank Transfer'), _bank_name, _account_number, _account_name, _crypto_wallet, _mobile_money_number, 'not_verified')
  ON CONFLICT (user_id) DO UPDATE SET
    method = EXCLUDED.method,
    bank_name = EXCLUDED.bank_name,
    account_number = EXCLUDED.account_number,
    account_name = EXCLUDED.account_name,
    crypto_wallet = EXCLUDED.crypto_wallet,
    mobile_money_number = EXCLUDED.mobile_money_number,
    status = CASE WHEN public.withdrawal_accounts.status = 'verified' THEN 'pending_review' ELSE 'not_verified' END,
    updated_at = now()
  RETURNING id INTO _id;

  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (auth.uid(), 'system', 'Withdrawal account saved', 'Your withdrawal account is saved for admin review.')
  ON CONFLICT DO NOTHING;
  RETURN _id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_withdrawal_account(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_support_ticket(_subject TEXT, _message TEXT, _priority TEXT DEFAULT 'normal')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF coalesce(trim(_subject), '') = '' OR coalesce(trim(_message), '') = '' THEN RAISE EXCEPTION 'Subject and message are required'; END IF;
  INSERT INTO public.support_tickets (user_id, subject, message, priority)
  VALUES (auth.uid(), _subject, _message, COALESCE(_priority, 'normal'))
  RETURNING id INTO _id;
  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (auth.uid(), 'system', 'Support ticket submitted', 'Our team will review your support request.');
  RETURN _id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(TEXT, TEXT, TEXT) TO authenticated;

-- Seed additional plan names used by the upgraded dashboard comparison.
INSERT INTO public.investment_plans (name, description, min_amount, max_amount, daily_roi_percent, duration_days, active) VALUES
  ('Growth', 'Balanced growth plan with medium risk and structured duration.', 500, 5000, 1.6, 90, true),
  ('Premium', 'Premium higher-limit plan for experienced investors.', 1000, 20000, 2.1, 180, true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.site_settings (key, value) VALUES
  ('dashboard_upgrade', '{"main_balance_hero":true,"privacy_mode":true,"maturity_countdown":true,"withdrawal_account_setup":true,"support_center":true,"dark_mode":true}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
