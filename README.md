# Household budget

A private web app for tracking bills, paychecks, transactions and monthly budgets for one household.

- Front end: Vite + React + TypeScript, installable as a PWA, hosted on GitHub Pages.
- Back end: Supabase (Postgres, Auth, Row Level Security). Only accounts listed in `household_members` can read or write anything.

This repository holds code and schema only. It never holds real financial data or secrets:
real spreadsheets, bank exports and generated seed SQL live in the git-ignored `private/` folder.

## How things run

- **Deploy:** every push to `main` builds the app and publishes it to GitHub Pages
  (`.github/workflows/deploy.yml`). The build reads the `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` repository variables.
- **Database changes:** SQL files in `supabase/migrations/` are applied only when someone runs
  the **Migrate database** workflow by hand from the Actions tab (`.github/workflows/migrate.yml`).
  Run it with "Dry run" ticked first. It connects using the `SUPABASE_DB_URL` repository secret
  (the Session pooler connection string).
- **Local development:** copy `.env.example` to `.env.local`, fill in the publishable key, then
  `npm install` and `npm run dev`.
