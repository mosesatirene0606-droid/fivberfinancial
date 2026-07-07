# Fixes applied

This package is the cleaned source project for fivberfinancial.

## Applied fixes

1. Loan wording was kept as `intensive` in the user-facing withdrawal/payment flow.
   - New active route: `/intensive-payment`
   - Old route `/loan-payment` is kept only as a legacy fallback so old links do not break.
   - Legacy database JSON keys such as `loan_interest_amount` may still be read as fallback for old records.

2. Old demo-mode wording was removed from source and Supabase migration text.
   - User-facing notifications now say account/wallet/investment, not old demo-mode wording.
   - Internal admin wallet wording is now used.

3. Supabase Edge Function editor errors were fixed.
   - `supabase/functions/admin-create-user/index.ts` now imports Supabase through `@supabase/supabase-js`.
   - `req` is typed as `Request`.
   - Deno VS Code settings were added for only `supabase/functions`.
   - `supabase/functions/admin-create-user/deno.json` was added.

4. Animated branded loader was added/connected.
   - Component: `src/components/brand/app-loader.tsx`
   - CSS: `src/styles.css`
   - Default route pending loader is set in `src/router.tsx`.

5. Deployment env compatibility was improved.
   - The app now accepts either `VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY`.
   - `.env.example` was added.

## Important note

The generated folders `.output`, `.wrangler`, and `supabase/.temp` were not included in the fixed zip because they are local/generated deployment artifacts. Run the commands below to recreate them:

```bash
npm install
npm run build
```

Then deploy to Vercel/Supabase using your production environment variables.
