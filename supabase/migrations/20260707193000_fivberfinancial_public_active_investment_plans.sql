-- Allow the public landing page to display active investment plans.
-- Admin still controls create/edit/delete through the existing authenticated admin policy.

GRANT SELECT ON public.investment_plans TO anon;
DROP POLICY IF EXISTS "Public read active investment plans" ON public.investment_plans;
CREATE POLICY "Public read active investment plans"
ON public.investment_plans
FOR SELECT TO anon
USING (active = true);
