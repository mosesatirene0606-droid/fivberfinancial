UPDATE public.payment_methods
SET active = false,
    updated_at = now()
WHERE lower(trim(name)) = 'cryptocurrency';