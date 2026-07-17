-- Ensure investment plan management works from the admin UI and active plans are visible on the public landing page.

GRANT SELECT ON public.investment_plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investment_plans TO authenticated;
GRANT ALL ON public.investment_plans TO service_role;
ALTER TABLE public.investment_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read active investment plans" ON public.investment_plans;
CREATE POLICY "Public read active investment plans"
ON public.investment_plans
FOR SELECT TO anon
USING (active = true);
DROP POLICY IF EXISTS "Users read active plans" ON public.investment_plans;
CREATE POLICY "Users read active plans"
ON public.investment_plans
FOR SELECT TO authenticated
USING (active = true OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage plans" ON public.investment_plans;
CREATE POLICY "Admins manage plans"
ON public.investment_plans
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
