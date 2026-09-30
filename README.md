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
