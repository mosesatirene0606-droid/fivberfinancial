-- Final admin guard and daily investment profit scheduler.
-- Keeps admin access server-verified and credits due investment profits automatically.

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'::public.app_role
  );
$$;
REVOKE ALL ON FUNCTION public.current_user_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO service_role;
-- Defensive cleanup for the known test account that should not have administrator access.
DELETE FROM public.user_roles ur
USING public.profiles p
WHERE ur.user_id = p.id
  AND ur.role = 'admin'::public.app_role
  AND lower(coalesce(p.email, '')) IN ('testuser1@gmail.com');
CREATE OR REPLACE FUNCTION public.credit_daily_profit()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.user_investments%ROWTYPE;
  _from_date DATE;
  _to_date DATE;
  _days_due INTEGER;
  _profit NUMERIC(18,2);
  _remaining_profit NUMERIC(18,2);
  _count_credited INTEGER := 0;
BEGIN
  FOR inv IN
    SELECT *
    FROM public.user_investments
    WHERE status = 'active'
      AND CURRENT_DATE >= start_date
      AND (last_profit_date IS NULL OR last_profit_date < LEAST(CURRENT_DATE, maturity_date))
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    _from_date := COALESCE(inv.last_profit_date, inv.start_date - 1);
    _to_date := LEAST(CURRENT_DATE, inv.maturity_date);
    _days_due := GREATEST((_to_date - _from_date), 0);

    IF _days_due <= 0 THEN
      CONTINUE;
    END IF;

    _remaining_profit := GREATEST(inv.total_expected_profit - inv.accrued_profit, 0);
    _profit := round(inv.amount * inv.daily_roi_percent / 100 * _days_due, 2);
    _profit := LEAST(_profit, _remaining_profit);

    IF _profit > 0 THEN
      UPDATE public.user_investments
      SET accrued_profit = accrued_profit + _profit,
          last_profit_date = _to_date,
          updated_at = now()
      WHERE id = inv.id;

      UPDATE public.balances
      SET available = available + _profit,
          total_profit = total_profit + _profit,
          updated_at = now()
      WHERE user_id = inv.user_id;

      INSERT INTO public.transactions (user_id, type, amount, status, reference, description, related_id)
      VALUES (
        inv.user_id,
        'daily_profit',
        _profit,
        'approved',
        inv.id::text,
        CASE WHEN _days_due = 1 THEN 'Daily earnings credited' ELSE 'Daily earnings credited for ' || _days_due || ' days' END,
        inv.id
      );

      INSERT INTO public.notifications (user_id, type, title, body)
      VALUES (
        inv.user_id,
        'earnings',
        'Daily earnings credited',
        'Your investment profit of ' || _profit || ' has been credited to your available balance.'
      );

      _count_credited := _count_credited + 1;
    ELSE
      UPDATE public.user_investments
      SET last_profit_date = _to_date,
          updated_at = now()
      WHERE id = inv.id;
    END IF;

    IF CURRENT_DATE >= inv.maturity_date THEN
      UPDATE public.user_investments
      SET status = 'completed',
          updated_at = now()
      WHERE id = inv.id
        AND status = 'active';

      UPDATE public.balances
      SET invested = GREATEST(invested - inv.amount, 0),
          available = available + inv.amount,
          updated_at = now()
      WHERE user_id = inv.user_id;

      INSERT INTO public.notifications (user_id, type, title, body)
      VALUES (
        inv.user_id,
        'investment',
        'Investment matured',
        'Your investment matured and your principal has been returned to your available balance.'
      );
    END IF;
  END LOOP;

  RETURN _count_credited;
END;
$$;
REVOKE ALL ON FUNCTION public.credit_daily_profit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.credit_daily_profit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.credit_daily_profit() TO service_role;
-- Let admins manually run the daily-profit job from SQL/API if needed.
CREATE OR REPLACE FUNCTION public.admin_run_daily_profit_credit()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN public.credit_daily_profit();
END;
$$;
REVOKE ALL ON FUNCTION public.admin_run_daily_profit_credit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_run_daily_profit_credit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_run_daily_profit_credit() TO service_role;
-- Schedule automatic daily profit crediting. Supabase projects support pg_cron;
-- if the extension is not available yet, this migration will still succeed and
-- the admin_run_daily_profit_credit RPC can be used manually until pg_cron is enabled.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron could not be enabled automatically: %', SQLERRM;
END;
$$;
DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('fivberfinancial-daily-profit');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'fivberfinancial-daily-profit',
    '5 0 * * *',
    'SELECT public.credit_daily_profit();'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Daily profit cron schedule was not created automatically: %', SQLERRM;
END;
$$;
