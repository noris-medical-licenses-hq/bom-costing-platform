# Supabase Setup Checklist

Run this checklist once per environment (staging, production).

---

## Step 1 — Create Supabase Project

- [ ] Log in at https://supabase.com/dashboard
- [ ] Click **New project**
- [ ] Set: Name = `bom-costing-platform`, Region = closest to users (e.g. eu-central-1)
- [ ] Note the **Project URL** and **API keys** (Settings → API)
- [ ] Wait for project to finish provisioning (~60 seconds)

---

## Step 2 — Configure Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   (Settings → API → anon/public key)
SUPABASE_SERVICE_ROLE_KEY=eyJ...       (Settings → API → service_role key — NEVER expose to frontend)
SUPABASE_DB_URL=postgres://postgres:PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Verify:
```bash
npm run check-env
```

Expected: `✅ Environment check passed.`

---

## Step 3 — Run Migrations

```bash
npm run verify-migrations        # static check only
npm run verify-migrations --live # requires SUPABASE_DB_URL
```

Apply migrations via Supabase CLI:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Or apply directly with psql (if you have the migration files):

```bash
for f in database/migrations/*.sql; do
  echo "Applying $f..."
  psql "$SUPABASE_DB_URL" -f "$f"
done
```

Verify:
```bash
npm run verify-migrations --live
```

Expected: all migrations applied.

---

## Step 4 — Enable Row-Level Security

RLS is enabled in migrations. To verify:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

All tables should show `rowsecurity = true`.

---

## Step 5 — Configure Authentication

In Supabase Dashboard → Authentication:

- [ ] Email confirmations: **Enabled**
- [ ] Site URL: set to your `NEXT_PUBLIC_SITE_URL`
- [ ] Redirect URLs: add `https://your-domain.com/**`

For the webhook (creates org + profile on first sign-in):

- [ ] Settings → Webhooks → Add webhook
  - URL: `https://your-domain.com/api/auth/webhook`
  - Events: `INSERT` on `auth.users`
  - Secret: same as `WEBHOOK_SECRET` in your env (if implemented)

---

## Step 6 — Apply Seed Data

```bash
# Get your org and user IDs from Supabase Dashboard → Table Editor

export ORG_ID=your-org-uuid-here
export USER_ID=your-user-uuid-here
npm run apply-seed
```

Or manually:
```bash
psql "$SUPABASE_DB_URL" \
  -v org_id="your-org-uuid" \
  -v user_id="your-user-uuid" \
  -f scripts/seed.sql
```

---

## Step 7 — Generate TypeScript Types

After any schema change:

```bash
npm run generate-types
npm run typecheck
```

---

## Step 8 — Smoke Test

Start the app:
```bash
npm run dev
```

Run smoke tests:
```bash
npm run smoke-test
```

Expected: all pages and API routes return 200.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| `check-env` fails | Verify keys are copied correctly from Supabase → Settings → API |
| Migration apply fails | Check DB URL format, ensure DB password has no special shell chars |
| Auth webhook 404 | Ensure app is running and URL is publicly accessible |
| RLS blocks all queries | Ensure user is authenticated; anon key only works for anon-policy rows |
| Type errors after schema change | Run `npm run generate-types` then `npm run typecheck` |
