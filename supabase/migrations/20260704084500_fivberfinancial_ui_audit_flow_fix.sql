-- fivberfinancial UI/admin flow hardening
-- Fixes manual credit failures caused by older admin accounts that do not yet have a public.profiles row.
-- Also backfills default profile/balance/preference rows for existing Auth users so simulation admin actions are stable.

INSERT INTO public.profiles (id, email, full_name, must_change_password, status)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email),
  COALESCE((u.raw_user_meta_data->>'must_change_password')::boolean, false),
  'active'
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
  updated_at = now();

INSERT INTO public.balances (user_id)
SELECT u.id FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.account_limits (user_id)
SELECT u.id FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_preferences (user_id)
SELECT u.id FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.audit(_action TEXT, _entity_type TEXT, _entity_id UUID, _metadata JSONB DEFAULT '{}'::jsonb)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_admin UUID := auth.uid();
BEGIN
  IF current_admin IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, full_name, must_change_password, status)
    SELECT
      u.id,
      u.email,
      COALESCE(u.raw_user_meta_data->>'full_name', u.email),
      false,
      'active'
    FROM auth.users u
    WHERE u.id = current_admin
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
      updated_at = now();
  END IF;

  INSERT INTO public.admin_audit_logs (admin_id, action, entity_type, entity_id, metadata)
  VALUES (current_admin, _action, _entity_type, _entity_id, COALESCE(_metadata, '{}'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit(TEXT, TEXT, UUID, JSONB) TO authenticated;
