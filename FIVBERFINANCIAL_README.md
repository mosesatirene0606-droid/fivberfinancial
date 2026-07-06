# fivberfinancial Investment & Brokerage Platform

This build completes the frontend screens and adds the production-oriented Supabase backend pieces for a premium investment/brokerage workflow.

## Completed in this package

- Rebranded UI and metadata from the previous name to `fivberfinancial`.
- Premium fintech landing page with white, blue, and emerald visual system.
- Secure auth pages: login, forgot password, reset password, forced temporary-password change.
- User dashboard with portfolio balance, available balance, invested amount, total profit, daily profit, withdrawals, deposit history, investment history, transaction history, notifications, and charts.
- KYC page with selfie/document/address upload flow.
- Deposit page with configurable payment methods, proof upload, and pending approval workflow.
- Investment plan page with server-calculated ROI/maturity RPC integration.
- Withdrawal page with KYC lock, payout details, status tracking, and admin-controlled processing.
- Transactions page with filters, references, statuses, and notifications.
- Admin panel at `/admin` for users, KYC review, deposit approvals, withdrawal processing, plan creation, financial controls, CMS announcements, and settings overview.
- Supabase migration for KYC, payment methods, investment plans, user investments, deposits, withdrawals, transactions, audit logs, CMS pages, announcements, settings, storage buckets, and server-side financial RPCs.
- Supabase Edge Function `admin-create-user` for administrator-only account creation.

## Important setup steps

1. Install dependencies:

```bash
npm install
```

2. Run the Supabase migration:

```bash
supabase db push
```

3. Deploy the admin user creation function:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
supabase functions deploy admin-create-user
```

4. Create/promote your first administrator in Supabase SQL:

```sql
insert into public.user_roles (user_id, role)
values ('YOUR_USER_UUID', 'admin')
on conflict (user_id, role) do nothing;
```

5. Start the app:

```bash
npm run dev
```

## Daily profit processing

The migration includes `public.credit_daily_profit()` for server-side daily ROI crediting. Schedule it using Supabase Cron or your preferred trusted backend scheduler. Do not calculate investment profits only on the client.

Example SQL call:

```sql
select public.credit_daily_profit();
```

## Security note

All money-moving flows are designed to use server-side database functions. Keep the Supabase service-role key only in Supabase Edge Function secrets or your private server environment. Never expose it in frontend code.

## Dashboard Fintech Upgrade Added

This package includes an additional migration:

```bash
supabase/migrations/20260704020500_fivberfinancial_dashboard_fintech_upgrade.sql
```

After replacing your current project files, push the new database changes:

```bash
npx supabase db push
```

The upgrade adds:

- Main balance hero card with privacy hide/show mode
- Smart next-action card
- Investment maturity countdown
- Withdrawal account setup table and RPC API
- Referral rewards tracking table
- Account limits table
- User preferences table
- Support tickets table and RPC API
- Dark mode dashboard support
- Statement CSV export and print/PDF statement action
- Mobile sticky bottom navigation and floating deposit button
- Admin-only Admin navigation visibility

New backend API/RPC functions:

```sql
public.upsert_withdrawal_account(...)
public.create_support_ticket(...)
```


## Dashboard Exact Design Upgrade - 2026-07-04

This version replaces the dashboard with the reference-style FivberFinancial layout:

- Large blue Total Portfolio Value hero card with balance privacy eye toggle.
- Working SVG portfolio growth and daily earnings charts that render even before live transactions exist.
- Next Action, KYC progress, Profile Completion, quick actions, Wallet Breakdown, Account Limits, Deposit Methods, Plan Comparison, Investment Maturity countdown, Referral Rewards, Withdrawal Account, Recent Activity, Recent Transactions, Security Activity, Support & Help, Trust & Security, Risk Notice, Compliance, Onboarding Checklist, and Appearance cards.
- The dashboard uses live Supabase data when available and safe demo chart data only to keep the UI visually testable when a new account has no history.

After extracting this version, run:

```powershell
npm install
npx supabase link --project-ref kyisozulioxhhzvlfjzu
npx supabase db push
npm run dev
```

The previous dashboard backend migration is still included:

```text
supabase/migrations/20260704020500_fivberfinancial_dashboard_fintech_upgrade.sql
```
