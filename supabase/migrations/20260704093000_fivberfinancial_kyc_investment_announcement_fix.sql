-- fivberfinancial simulation workflow fixes
-- 1. Allows admin-created user investments for simulation mode.
-- 2. Allows announcements to be sent either globally or to a single user.
-- 3. Keeps KYC document metadata visible to admins through existing kyc_submissions.document_urls.

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS announcements_target_user_idx ON public.announcements(target_user_id, created_at DESC);
DROP POLICY IF EXISTS "Public read active announcements" ON public.announcements;
CREATE POLICY "Users read relevant active announcements" ON public.announcements
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin')
  OR (
    active
    AND (
      COALESCE(audience, 'general') = 'general'
      OR target_user_id IS NULL
      OR target_user_id = auth.uid()
    )
  )
);
CREATE OR REPLACE FUNCTION public.admin_send_announcement(
  _title TEXT,
  _body TEXT DEFAULT NULL,
  _audience TEXT DEFAULT 'general',
  _target_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  announcement_id UUID;
BEGIN
  PERFORM public.assert_admin();

  IF COALESCE(NULLIF(trim(_title), ''), '') = '' THEN
    RAISE EXCEPTION 'Announcement title is required';
  END IF;

  IF _audience NOT IN ('general', 'individual') THEN
    RAISE EXCEPTION 'Audience must be general or individual';
  END IF;

  IF _audience = 'individual' AND _target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user is required for individual announcements';
  END IF;

  IF _audience = 'individual' AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _target_user_id) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  INSERT INTO public.announcements (title, body, active, created_by, audience, target_user_id)
  VALUES (trim(_title), _body, _audience = 'general', auth.uid(), _audience, CASE WHEN _audience = 'individual' THEN _target_user_id ELSE NULL END)
  RETURNING id INTO announcement_id;

  IF _audience = 'general' THEN
    INSERT INTO public.notifications (user_id, type, title, body)
    SELECT id, 'system', trim(_title), _body
    FROM public.profiles
    WHERE status <> 'deleted';
  ELSE
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (_target_user_id, 'system', trim(_title), _body);
  END IF;

  PERFORM public.audit(
    'announcement.sent',
    'announcements',
    announcement_id,
    jsonb_build_object('audience', _audience, 'target_user_id', _target_user_id)
  );

  RETURN announcement_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_send_announcement(TEXT, TEXT, TEXT, UUID) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_create_user_investment(
  _user_id UUID,
  _plan_id UUID,
  _amount NUMERIC,
  _description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plan_row public.investment_plans%ROWTYPE;
  investment_id UUID;
  expected_profit NUMERIC(18,2);
  tx_description TEXT;
BEGIN
  PERFORM public.assert_admin();

  IF _user_id IS NULL THEN RAISE EXCEPTION 'User is required'; END IF;
  IF _plan_id IS NULL THEN RAISE EXCEPTION 'Investment plan is required'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  SELECT * INTO plan_row FROM public.investment_plans WHERE id = _plan_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active investment plan not found'; END IF;
  IF _amount < plan_row.min_amount THEN RAISE EXCEPTION 'Amount is below the selected plan minimum'; END IF;
  IF plan_row.max_amount IS NOT NULL AND _amount > plan_row.max_amount THEN RAISE EXCEPTION 'Amount is above the selected plan maximum'; END IF;

  INSERT INTO public.balances (user_id) VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  expected_profit := ROUND((_amount * plan_row.daily_roi_percent / 100) * plan_row.duration_days, 2);
  tx_description := COALESCE(NULLIF(trim(_description), ''), 'Admin-created simulation investment: ' || plan_row.name);

  INSERT INTO public.user_investments (
    user_id,
    plan_id,
    amount,
    daily_roi_percent,
    duration_days,
    total_expected_profit,
    maturity_date,
    status
  ) VALUES (
    _user_id,
    plan_row.id,
    _amount,
    plan_row.daily_roi_percent,
    plan_row.duration_days,
    expected_profit,
    CURRENT_DATE + plan_row.duration_days,
    'active'
  ) RETURNING id INTO investment_id;

  UPDATE public.balances
  SET invested = invested + _amount, updated_at = now()
  WHERE user_id = _user_id;

  INSERT INTO public.transactions (user_id, type, amount, status, reference, description)
  VALUES (_user_id, 'investment', _amount, 'completed', 'ADMIN-INVEST', tx_description);

  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (
    _user_id,
    'investment',
    'Investment activated',
    'An administrator created a simulation investment of ' || trim(to_char(_amount, 'FM999999999999990.00')) || ' on the ' || plan_row.name || ' plan.'
  );

  PERFORM public.audit(
    'simulation_investment.created',
    'user_investments',
    investment_id,
    jsonb_build_object('user_id', _user_id, 'plan_id', _plan_id, 'amount', _amount, 'plan', plan_row.name, 'simulation_mode', true)
  );

  RETURN investment_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_create_user_investment(UUID, UUID, NUMERIC, TEXT) TO authenticated;
