# Starlight Production System — Web Application

## Quick Start

### 1. Prerequisites
- Node.js 18+ installed
- Your Supabase project URL and anon key (Dashboard > Settings > API)

### 2. Setup
```bash
# Clone or extract this folder
cd starlight-web

# Install dependencies
npm install

# Create environment file
cp .env.local.example .env.local
# Edit .env.local and add your Supabase URL and key

# Run dev server
npm run dev
```

Open http://localhost:3000

### 3. Create Your First User in Supabase
Go to Supabase Dashboard > Authentication > Users > Add User:
- Email: your email
- Password: your choice
- This is for the Production Manager login

### 4. Deploy to Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard:
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## Project Structure
```
src/
  app/
    login/           — Login page
    (dashboard)/     — Authenticated layout with sidebar
      page.tsx       — Dashboard (Phase 1)
      jobs/          — Jobs list + detail (Phase 2)
      workshop/      — Workshop view (Phase 4)
      review/        — Exceptions (Phase 6)
      capacity/      — Manpower (Phase 7)
      materials/     — Catalogue (Phase 7)
      crew/          — Scheduling (Phase 7)
  components/
    sidebar.tsx      — Navigation sidebar
    ui/badges.tsx    — StatusBadge, DaysRemaining, PhasePill
  lib/
    supabase-browser.ts  — Browser Supabase client
    supabase-server.ts   — Server Supabase client
    types.ts             — Database types
    utils.ts             — Helpers (cn, formatCurrency, etc.)
  middleware.ts          — Auth guard
```

## Colour System
- Navy: #1A1A2E (sidebar, headings)
- Red: #C0392B (primary actions)
- Blue: #2980B9 (In-Progress)
- Green: #27AE60 (Complete)
- Amber: #F39C12 (warnings, On-Hold)
- Background: #F4F5F7
