# Friends Included — Finance System

New standalone project for the Day 4 homework. It connects Telegram, Supabase, Vercel and Google Sheets. Supabase is the source of truth.

## Files
- `pages/index.tsx` — website UI
- `pages/api/index.ts` — website API
- `pages/api/telegram.ts` — real Telegram webhook
- `pages/api/google-health.ts` — safe Google connectivity check
- `lib/business.ts` — shared finance rules
- `lib/service.ts` — shared transaction processing
- `lib/googleSheets.ts` — idempotent Sheets row updates by reference
- `lib/supabase.ts` — server Supabase client
- `lib/telegram.ts` — Telegram sendMessage
- `schema.sql` — database schema
- `.env.example` — environment variable names only

## Setup order
1. Create a new Supabase project and run `schema.sql`.
2. Create a Google Sheet with exactly two tabs: `Sales` and `Expenses`.
3. Share the Sheet with the Google service account as Editor.
4. Create a Telegram bot.
5. Add variables from `.env.example` to Vercel.
6. Deploy the GitHub repository to a new Vercel project.
7. Set Telegram webhook to `https://YOUR_DOMAIN/api/telegram` using the webhook secret.
8. Open `/api/google-health` to verify Google access without exposing credentials.
9. Clear practice transactions before official Test 1.

## Security
Never commit service-role keys, Telegram tokens, or Google private keys. If an old Google service-account key was previously exposed, revoke it and replace it after the integration works.


## Safe one-time cleanup before official Test 1

Run only this SQL in the new Supabase project's SQL Editor:

```sql
delete from sales;
delete from expenses;
```

Do not delete the employee rows. Telegram links can be preserved or relinked through the manager UI.

## Official verification order

1. Confirm production deployment is READY.
2. Confirm Supabase tables exist and the website persists records after refresh.
3. Confirm `/api/google-health` returns `ok: true` and shows exactly the `Sales` and `Expenses` tabs.
4. Confirm Telegram webhook points to `/api/telegram`.
5. Run Test 1 exactly as specified, including S01 and E01 through the real Telegram bot.
6. Verify Test 1 totals: Project A €700, Project B €1,800, Company €2,400; commissions €90 / €110 / €100.
7. Keep Test 1 data and run Test 2.
8. Verify cumulative Test 2 totals: Project A €2,050, Project B €2,180, Company €3,930; commissions €140 / €175 / €215.
9. Run the permission, duplicate-reference, zero-amount, invalid-split, idempotent-approval, Sheets retry and Telegram notification retry checks.
10. Submit the production Vercel URL only after all checks pass.


> Vercel Supabase resource connected for production verification.
