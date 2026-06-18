# NW Schedule — Setup Guide

## Step 1: Install Node.js
Download from https://nodejs.org (v18 or newer)

## Step 2: Install dependencies
Open this folder in terminal, run:
```
npm install
```

## Step 3: Set up Supabase (free)
1. Go to https://supabase.com → Sign up → New Project
2. Copy your Project URL and anon key from: Settings → API
3. Copy `.env.local.example` → `.env.local`
4. Fill in your credentials

## Step 4: Run the database schema
1. In Supabase → SQL Editor
2. Paste the entire content of `supabase-schema.sql`
3. Click Run

## Step 5: Create your first Superadmin account
1. In Supabase → Authentication → Users → Invite User
2. Use your email, set a password
3. In Supabase → Table Editor → profiles → find your row
4. Change `role` from `host` to `superadmin`

## Step 6: Run the app locally
```
npm run dev
```
Open http://localhost:3000

## Step 7: Deploy to Vercel (free hosting)
1. Push to GitHub
2. Go to https://vercel.com → Import project
3. Add your `.env.local` values as Environment Variables
4. Deploy — done!

---

## User Roles
| Role | Can Do |
|---|---|
| **superadmin** | Everything — schedule, hosts, payroll, rooms |
| **host** | See own schedule, check in/out |
| **client** | See their brand's live schedule only |

## Salary Period
- Always 21st of month A → 20th of month B
- Payroll page auto-groups by this period

## Tech Stack
- Next.js 14 (React)
- Supabase (PostgreSQL + Auth)
- Tailwind CSS
- Vercel (hosting)
- All FREE tier
