-- fivberfinancial KYC admin visibility fix only
-- This migration does NOT unlock withdrawals. Users must still have approved KYC before withdrawal.

CREATE OR REPLACE FUNCTION public.admin_list_kyc_submissions()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_full_name TEXT,
  user_email TEXT,
  status public.kyc_status,
  proof_of_address TEXT,
  document_urls JSONB,
  admin_notes TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN QUERY
  SELECT
    k.id,
    k.user_id,
    p.full_name AS user_full_name,
    p.email AS user_email,
    k.status,
    k.proof_of_address,
    COALESCE(k.document_urls, '{}'::jsonb) AS document_urls,
    k.admin_notes,
    k.submitted_at,
    k.reviewed_at,
    k.reviewed_by
  FROM public.kyc_submissions k
  LEFT JOIN public.profiles p ON p.id = k.user_id
  ORDER BY k.submitted_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_kyc_submissions() TO authenticated;

DROP POLICY IF EXISTS "Admins read all kyc documents" ON storage.objects;
CREATE POLICY "Admins read all kyc documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'kyc-documents' AND public.has_role(auth.uid(), 'admin'));
