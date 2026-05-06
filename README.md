# Tour de V2 Live Timing App — Supabase Version

This version uses Supabase for true multi-device live sync.

## What changed

- Participants are stored in Supabase
- Waves are stored in Supabase
- Finish times and verified scores update live across devices
- Display Screen can run on a TV/monitor while staff use Scoring on another device
- Public users can read results
- Staff must sign in to add, edit, score, or delete

Supabase Realtime uses Postgres Changes subscriptions, and this app uses `@supabase/supabase-js`.

## 1. Create Supabase project

1. Go to https://supabase.com
2. Create a new project
3. Open SQL Editor
4. Paste and run `supabase/schema.sql`

## 2. Add staff users

In Supabase:

Authentication → Users → Add user

Create staff users with email/password.

## 3. Get API keys

In Supabase:

Project Settings → API

Copy:

- Project URL
- anon public key

## 4. Local environment

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in:

```text
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## 5. Run locally

```bash
npm install
npm run dev
```

## 6. Deploy on Vercel

1. Push this folder to GitHub
2. Import it into Vercel
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

## Staff vs display

- Staff scoring: open app normally and sign in
- TV display: open the app and switch to Display Screen
- Later, this can be split into URLs like:
  - `/scoring`
  - `/display`
  - `/results`

## Notes

Public read is enabled so displays and results can be viewed without login.
Writes require authenticated staff.
