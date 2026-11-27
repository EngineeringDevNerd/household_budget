# Household budget

A private web app for tracking bills, paychecks, transactions and monthly budgets for one household.

- Front end: Vite + React + TypeScript, installable as a PWA, hosted on GitHub Pages.
- Back end: Supabase (Postgres, Auth, Row Level Security). Only accounts listed in `household_members` can read or write anything.

This repository holds code and schema only. It never holds real financial data or secrets:
real spreadsheets, bank exports and generated seed SQL live in the git-ignored `private/` folder.
