# admin-create-user

Secure Supabase Edge Function used by the admin dashboard to create user accounts.

Required secret:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Deploy:

```bash
supabase functions deploy admin-create-user
```

Only authenticated users with `user_roles.role = 'admin'` can create accounts.
