# Tour de V2 Supabase Deployment Checklist

## Supabase

1. Create Supabase project.
2. Run `supabase/schema.sql` in SQL Editor.
3. Create staff users in Authentication.
4. Copy Project URL and anon key.

## Vercel

1. Push project to GitHub.
2. Import project in Vercel.
3. Add environment variables:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
4. Deploy.
5. Open deployed URL.

## Testing

1. Sign in as staff.
2. Create event by selecting location/date.
3. Add participant.
4. Start Wave 1.
5. Record finish by bib.
6. Enter routes completed.
7. Verify scorecard.
8. Open same app on another device.
9. Confirm results update live.
