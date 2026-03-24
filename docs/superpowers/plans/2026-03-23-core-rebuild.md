# TV Alert Analyzer — Core Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the TV Alert Analyzer as a modern React + TypeScript app with proper auth, database design, and restructured backend.

**Architecture:** New Vite + React frontend (designs from Stitch pending), Vercel Serverless Functions for API (migrated + restructured from old project), Supabase for database + auth. Two-pass AI analysis with Claude.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vite, Supabase, React Query, React Router, Lucide React, Vercel Serverless Functions, Anthropic SDK

**Spec:** `docs/superpowers/specs/2026-03-23-tv-alert-analyzer-rebuild-design.md`

**Old project:** `C:\Users\Omar\OneDrive - SUNRIGHT CORPORATION\文件\Claude\tv-alert-analyzer`

---

## File Structure

```
tv-alert-analyzer/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── vercel.json
├── .env.example
├── .gitignore
├── src/
│   ├── App.tsx                    # Router + QueryClientProvider + AuthProvider
│   ├── main.tsx                   # Entry point
│   ├── index.css                  # Tailwind imports + dark theme globals
│   ├── lib/
│   │   ├── supabase.ts           # Supabase client singleton
│   │   └── utils.ts              # Date formatters, price formatters, cn() helper
│   ├── types/
│   │   ├── index.ts              # App-level types (Alert, Analysis, Trade, Lesson, etc.)
│   │   └── supabase.ts           # Generated Supabase types (placeholder until DB ready)
│   ├── contexts/
│   │   └── AuthContext.tsx        # Auth provider: user, loading, signIn, signUp, signOut
│   ├── hooks/
│   │   ├── useAlerts.ts          # React Query hooks for alerts
│   │   ├── useTracking.ts        # React Query hooks for tracked trades
│   │   ├── useLessons.ts         # React Query hooks for lessons
│   │   ├── useFavorites.ts       # React Query hooks for favorites
│   │   └── useStats.ts           # React Query hooks for stats
│   ├── components/
│   │   ├── ui/                   # Shared primitives (Button, Card, Badge, Modal, Toast, Input, Skeleton)
│   │   ├── layout/
│   │   │   ├── AppShell.tsx      # Sidebar + TopNav + main content area
│   │   │   ├── Sidebar.tsx       # Navigation sidebar (desktop)
│   │   │   ├── TopNav.tsx        # Top bar with search
│   │   │   └── MobileNav.tsx     # Bottom tab bar (mobile)
│   │   ├── dashboard/            # Dashboard-specific components
│   │   ├── alerts/               # Alert list/detail components
│   │   ├── tracking/             # Trade tracking components
│   │   └── lessons/              # Lesson components
│   └── pages/
│       ├── LoginPage.tsx
│       ├── DashboardPage.tsx
│       ├── AlertsPage.tsx
│       ├── AlertDetailPage.tsx
│       ├── TrackingPage.tsx
│       ├── FavoritesPage.tsx
│       ├── LessonsPage.tsx
│       └── SettingsPage.tsx
├── api/                           # Vercel Serverless Functions
│   ├── _lib/
│   │   ├── supabase.ts           # Server Supabase clients (user + admin)
│   │   ├── config.ts             # Env var validation + defaults
│   │   ├── errors.ts             # withErrorHandler, ApiError
│   │   ├── retry.ts              # withRetry + exponential backoff
│   │   ├── cache.ts              # In-memory TTL cache
│   │   ├── types.ts              # Shared API types
│   │   ├── anthropic.ts          # Two-pass Claude analysis
│   │   ├── market-data.ts        # Yahoo Finance + technical indicators
│   │   ├── market-context.ts     # S&P 500, VIX, sector data (NEW)
│   │   ├── news.ts              # Google News RSS (with retry)
│   │   ├── screenshot.ts         # Finviz chart URL generation
│   │   ├── telegram.ts           # Telegram notifications
│   │   ├── tracker.ts            # Trade tracking + PnL
│   │   └── reviewer.ts           # AI post-trade review + lessons
│   ├── webhook.ts                # POST /api/webhook (TradingView)
│   ├── alerts/
│   │   ├── index.ts              # GET /api/alerts
│   │   └── [id].ts              # GET /api/alerts/:id
│   ├── tracking/
│   │   └── index.ts              # GET /api/tracking
│   ├── favorites.ts              # GET/POST/DELETE /api/favorites
│   ├── lessons.ts                # GET /api/lessons
│   ├── stats.ts                  # GET /api/stats
│   └── cron/
│       └── check-trades.ts       # Cron: check & resolve trades
├── supabase/
│   └── migrations/
│       ├── 001_profiles.sql
│       ├── 002_alerts.sql
│       ├── 003_analyses.sql
│       ├── 004_tracked_trades.sql
│       ├── 005_lessons.sql
│       ├── 006_favorites.sql
│       ├── 007_watchlist.sql
│       └── 008_rls_policies.sql
└── scripts/
    └── migrate-data.ts            # Old DB → new DB migration
```

---

## Phase 1: Project Scaffolding

### Task 1: Initialize Vite + React project

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/index.css`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `vercel.json`

- [ ] **Step 1: Create project with Vite**

```bash
cd "C:\Users\Omar\Claude Code\claude projects"
npm create vite@latest tv-alert-analyzer -- --template react-ts
cd tv-alert-analyzer
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js @tanstack/react-query react-router-dom lucide-react
npm install -D @tailwindcss/vite tailwindcss
```

- [ ] **Step 3: Configure Vite with Tailwind**

`vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

- [ ] **Step 4: Set up Tailwind with dark theme**

`src/index.css`:
```css
@import "tailwindcss";

:root {
  --color-bg-primary: #0f1419;
  --color-bg-secondary: #1a1f2e;
  --color-bg-card: #1e2433;
  --color-border: #2a3142;
  --color-text-primary: #e4e8ef;
  --color-text-secondary: #8b95a8;
  --color-buy: #22c55e;
  --color-sell: #ef4444;
  --color-hold: #f59e0b;
}

body {
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
}
```

- [ ] **Step 5: Set up entry point**

`src/main.tsx`:
```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/App.tsx`:
```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<div className="p-8 text-white">TV Alert Analyzer</div>} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
```

- [ ] **Step 6: Create .env.example**

```env
# Supabase
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# API (server-side only, in Vercel env vars)
# SUPABASE_SERVICE_ROLE_KEY=
# ANTHROPIC_API_KEY=
# TELEGRAM_BOT_TOKEN=
# TELEGRAM_CHAT_ID=
# WEBHOOK_SECRET=
# CRON_SECRET=
# MIN_CONFIDENCE=60
# MAX_TRACKING_DAYS=7
# ANALYSIS_MODEL=claude-sonnet-4-20250514
```

- [ ] **Step 7: Create vercel.json**

```json
{
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ],
  "crons": [
    { "path": "/api/cron/check-trades", "schedule": "0 21 * * 1-5" }
  ]
}
```

- [ ] **Step 8: Create .gitignore**

```
node_modules
dist
.env
.env.local
.vercel
```

- [ ] **Step 9: Verify build works**

```bash
npm run build
```
Expected: Build succeeds with no errors.

- [ ] **Step 10: Initialize git and commit**

```bash
git init
git add .
git commit -m "feat: initialize project with Vite + React + TypeScript + Tailwind"
```

---

### Task 2: Types and Supabase client

**Files:**
- Create: `src/types/index.ts`
- Create: `src/lib/supabase.ts`
- Create: `src/lib/utils.ts`

- [ ] **Step 1: Define app-level types**

`src/types/index.ts`:
```typescript
export interface Alert {
  id: string
  user_id: string
  ticker: string
  exchange: string | null
  timeframe: string | null
  price: number | null
  action: string
  message: string | null
  raw_payload: Record<string, unknown> | null
  created_at: string
  updated_at: string
  analyses?: Analysis[]
}

export interface Analysis {
  id: string
  alert_id: string
  user_id: string
  recommendation: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  summary: string
  entry_price: number | null
  stop_loss: number | null
  take_profit: number | null
  support_price: number | null
  resistance_price: number | null
  rsi: number | null
  sma_20: number | null
  sma_50: number | null
  sma_200: number | null
  macd_signal: string | null
  volume_trend: string | null
  market_context: Record<string, unknown> | null
  news_context: Record<string, unknown> | null
  chart_urls: Record<string, string> | null
  model_used: string | null
  prompt_version: string | null
  raw_response: Record<string, unknown> | null
  created_at: string
}

export interface TrackedTrade {
  id: string
  user_id: string
  analysis_id: string
  ticker: string
  recommendation: 'BUY' | 'SELL'
  entry_price: number
  current_price: number | null
  stop_loss: number | null
  take_profit: number | null
  status: 'tracking' | 'success' | 'failed' | 'expired'
  pnl_percent: number | null
  resolved_at: string | null
  expires_at: string
  confidence: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Lesson {
  id: string
  user_id: string
  trade_id: string | null
  ticker: string
  lesson_type: string
  lesson_text: string
  key_takeaway: string
  tags: string[]
  original_analysis: Record<string, unknown> | null
  market_conditions: Record<string, unknown> | null
  relevance_score: number
  times_used: number
  created_at: string
}

export interface Favorite {
  id: string
  user_id: string
  alert_id: string
  note: string | null
  created_at: string
  alert?: Alert
}

export interface TradingStats {
  total: number
  tracking: number
  success: number
  failed: number
  expired: number
  winRate: number
  avgPnl: number
  totalPnl: number
}

export interface TradingViewAlert {
  ticker: string
  exchange?: string
  timeframe?: string
  price?: string
  volume?: string
  message?: string
}
```

- [ ] **Step 2: Create Supabase client**

`src/lib/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 3: Create utility helpers**

`src/lib/utils.ts`:
```typescript
export function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function formatPrice(price: number | null | undefined): string {
  if (price == null) return '—'
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return '—'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function recommendationColor(rec: string): string {
  switch (rec) {
    case 'BUY': return 'text-green-500'
    case 'SELL': return 'text-red-500'
    case 'HOLD': return 'text-amber-500'
    default: return 'text-gray-500'
  }
}

export function recommendationBgColor(rec: string): string {
  switch (rec) {
    case 'BUY': return 'bg-green-500/10 text-green-400 border-green-500/20'
    case 'SELL': return 'bg-red-500/10 text-red-400 border-red-500/20'
    case 'HOLD': return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20'
  }
}
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/supabase.ts src/lib/utils.ts
git commit -m "feat: add types, Supabase client, and utility helpers"
```

---

## Phase 2: Database Schema

### Task 3: Create Supabase migrations

**Files:**
- Create: `supabase/migrations/001_profiles.sql`
- Create: `supabase/migrations/002_alerts.sql`
- Create: `supabase/migrations/003_analyses.sql`
- Create: `supabase/migrations/004_tracked_trades.sql`
- Create: `supabase/migrations/005_lessons.sql`
- Create: `supabase/migrations/006_favorites.sql`
- Create: `supabase/migrations/007_watchlist.sql`
- Create: `supabase/migrations/008_rls_policies.sql`

- [ ] **Step 1: Create profiles migration**

`supabase/migrations/001_profiles.sql`:
```sql
-- Profiles table (linked to Supabase Auth)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  telegram_chat_id TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Create alerts migration**

`supabase/migrations/002_alerts.sql`:
```sql
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  exchange TEXT DEFAULT 'NASDAQ',
  timeframe TEXT DEFAULT 'D',
  price NUMERIC(12,4),
  action TEXT NOT NULL DEFAULT 'alert',
  message TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_alerts_user_id ON alerts(user_id);
CREATE INDEX idx_alerts_ticker ON alerts(ticker);
CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX idx_alerts_action ON alerts(action);

CREATE TRIGGER alerts_updated_at
  BEFORE UPDATE ON alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 3: Create analyses migration**

`supabase/migrations/003_analyses.sql`:
```sql
CREATE TABLE analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recommendation TEXT NOT NULL CHECK (recommendation IN ('BUY', 'SELL', 'HOLD')),
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  summary TEXT NOT NULL DEFAULT '',
  entry_price NUMERIC(12,4),
  stop_loss NUMERIC(12,4),
  take_profit NUMERIC(12,4),
  support_price NUMERIC(12,4),
  resistance_price NUMERIC(12,4),
  rsi NUMERIC(6,2),
  sma_20 NUMERIC(12,4),
  sma_50 NUMERIC(12,4),
  sma_200 NUMERIC(12,4),
  macd_signal TEXT,
  volume_trend TEXT,
  market_context JSONB,
  news_context JSONB,
  chart_urls JSONB,
  model_used TEXT,
  prompt_version TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_analyses_alert_id ON analyses(alert_id);
CREATE INDEX idx_analyses_user_id ON analyses(user_id);
CREATE INDEX idx_analyses_recommendation ON analyses(recommendation);
CREATE INDEX idx_analyses_confidence ON analyses(confidence DESC);
CREATE INDEX idx_analyses_created_at ON analyses(created_at DESC);
```

- [ ] **Step 4: Create tracked_trades migration**

`supabase/migrations/004_tracked_trades.sql`:
```sql
CREATE TABLE tracked_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  recommendation TEXT NOT NULL CHECK (recommendation IN ('BUY', 'SELL')),
  entry_price NUMERIC(12,4) NOT NULL,
  current_price NUMERIC(12,4),
  stop_loss NUMERIC(12,4),
  take_profit NUMERIC(12,4),
  status TEXT NOT NULL DEFAULT 'tracking' CHECK (status IN ('tracking', 'success', 'failed', 'expired')),
  pnl_percent NUMERIC(8,4),
  resolved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  confidence INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tracked_trades_user_id ON tracked_trades(user_id);
CREATE INDEX idx_tracked_trades_status ON tracked_trades(status);
CREATE INDEX idx_tracked_trades_ticker ON tracked_trades(ticker);
CREATE INDEX idx_tracked_trades_created_at ON tracked_trades(created_at DESC);

CREATE TRIGGER tracked_trades_updated_at
  BEFORE UPDATE ON tracked_trades
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 5: Create lessons migration**

`supabase/migrations/005_lessons.sql`:
```sql
CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trade_id UUID REFERENCES tracked_trades(id) ON DELETE SET NULL,
  ticker TEXT NOT NULL,
  lesson_type TEXT NOT NULL,
  lesson_text TEXT NOT NULL,
  key_takeaway TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  original_analysis JSONB,
  market_conditions JSONB,
  relevance_score INTEGER DEFAULT 50,
  times_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_lessons_user_id ON lessons(user_id);
CREATE INDEX idx_lessons_tags ON lessons USING GIN(tags);
CREATE INDEX idx_lessons_relevance ON lessons(relevance_score DESC);
```

- [ ] **Step 6: Create favorites migration**

`supabase/migrations/006_favorites.sql`:
```sql
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, alert_id)
);

CREATE INDEX idx_favorites_user_id ON favorites(user_id);
```

- [ ] **Step 7: Create watchlist migration**

`supabase/migrations/007_watchlist.sql`:
```sql
CREATE TABLE watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  notes TEXT,
  notify_on_signal BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, ticker)
);

CREATE INDEX idx_watchlist_user_id ON watchlist(user_id);
```

- [ ] **Step 8: Create RLS policies migration**

`supabase/migrations/008_rls_policies.sql`:
```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update own profile
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Alerts: users can view own, service_role inserts via webhook
CREATE POLICY "Users can view own alerts" ON alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own alerts" ON alerts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Analyses: users can view own
CREATE POLICY "Users can view own analyses" ON analyses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own analyses" ON analyses FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Tracked trades: users can view/update own
CREATE POLICY "Users can view own trades" ON tracked_trades FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trades" ON tracked_trades FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trades" ON tracked_trades FOR UPDATE USING (auth.uid() = user_id);

-- Lessons: users can view own
CREATE POLICY "Users can view own lessons" ON lessons FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own lessons" ON lessons FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Favorites: full CRUD on own
CREATE POLICY "Users can view own favorites" ON favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own favorites" ON favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own favorites" ON favorites FOR DELETE USING (auth.uid() = user_id);

-- Watchlist: full CRUD on own
CREATE POLICY "Users can view own watchlist" ON watchlist FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own watchlist" ON watchlist FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own watchlist" ON watchlist FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own watchlist" ON watchlist FOR DELETE USING (auth.uid() = user_id);
```

- [ ] **Step 9: Commit all migrations**

```bash
git add supabase/
git commit -m "feat: add database migrations with RLS policies"
```

- [ ] **Step 10: Run migrations on Supabase**

Apply migrations via Supabase dashboard SQL editor or `npx supabase db push` if linked.

---

## Phase 3: API Infrastructure

### Task 4: API utility modules

**Files:**
- Create: `api/_lib/config.ts`
- Create: `api/_lib/errors.ts`
- Create: `api/_lib/retry.ts`
- Create: `api/_lib/cache.ts`
- Create: `api/_lib/supabase.ts`
- Create: `api/_lib/types.ts`

- [ ] **Step 1: Create config module**

`api/_lib/config.ts`:
```typescript
function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

export const config = {
  SUPABASE_URL: required('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),
  SUPABASE_ANON_KEY: required('SUPABASE_ANON_KEY'),
  ANTHROPIC_API_KEY: required('ANTHROPIC_API_KEY'),
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || '',
  CRON_SECRET: process.env.CRON_SECRET || '',
  MIN_CONFIDENCE: parseInt(process.env.MIN_CONFIDENCE || '60'),
  MAX_TRACKING_DAYS: parseInt(process.env.MAX_TRACKING_DAYS || '7'),
  CACHE_TTL_MARKET: parseInt(process.env.CACHE_TTL_MARKET || '300000'),
  CACHE_TTL_NEWS: parseInt(process.env.CACHE_TTL_NEWS || '900000'),
  ANALYSIS_MODEL: process.env.ANALYSIS_MODEL || 'claude-sonnet-4-20250514',
}
```

- [ ] **Step 2: Create error handling module**

`api/_lib/errors.ts`:
```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node'

export interface ApiError {
  error: string
  code: string
  details?: unknown
}

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<VercelResponse | void>

export function withErrorHandler(handler: Handler): Handler {
  return async (req, res) => {
    try {
      return await handler(req, res)
    } catch (err: any) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
      }))
      return res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      } satisfies ApiError)
    }
  }
}
```

- [ ] **Step 3: Create retry module**

`api/_lib/retry.ts`:
```typescript
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  label = 'operation'
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (err: any) {
      if (i === maxRetries - 1) throw err
      const delay = Math.pow(2, i) * 1000
      console.warn(`${label} failed (attempt ${i + 1}/${maxRetries}), retrying in ${delay}ms: ${err.message}`)
      await sleep(delay)
    }
  }
  throw new Error('Unreachable')
}
```

- [ ] **Step 4: Create cache module**

`api/_lib/cache.ts`:
```typescript
const store = new Map<string, { data: unknown; expires: number }>()

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const entry = store.get(key)
  if (entry && entry.expires > Date.now()) {
    return entry.data as T
  }
  const result = await fn()
  store.set(key, { data: result, expires: Date.now() + ttlMs })
  return result
}

export function invalidate(key: string): void {
  store.delete(key)
}
```

- [ ] **Step 5: Create server-side Supabase clients**

`api/_lib/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest } from '@vercel/node'
import { config } from './config'

// Admin client for webhook/cron (bypasses RLS)
export const adminClient = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)

// User client from JWT (respects RLS)
export function createUserClient(req: VercelRequest) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) throw new Error('Missing authorization header')

  return createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}
```

- [ ] **Step 6: Create shared API types**

`api/_lib/types.ts`:
```typescript
export interface TradingViewAlert {
  ticker: string
  exchange?: string
  timeframe?: string
  price?: string
  volume?: string
  message?: string
}

export interface AnalysisResult {
  recommendation: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  summary: string
  entry_price: number | null
  stop_loss: number | null
  take_profit: number | null
  support_price: number | null
  resistance_price: number | null
  rsi: number | null
  sma_20: number | null
  sma_50: number | null
  sma_200: number | null
  macd_signal: string | null
  volume_trend: string | null
}

export interface MarketData {
  price: number
  open: number
  high: number
  low: number
  previousClose: number
  volume: number
  avgVolume: number
  marketCap: number
  pe: number
  eps: number
  week52High: number
  week52Low: number
  changePercent: number
}

export interface TechnicalIndicators {
  sma20: number
  sma50: number
  sma200: number
  rsi14: number
  macdLine: number
  macdSignal: number
  macdHistogram: number
  atr14: number
  bollingerUpper: number
  bollingerLower: number
  volumeRatio: number
  priceVsSma20: string
  priceVsSma50: string
  priceVsSma200: string
  goldenCross: boolean
  deathCross: boolean
}

export interface StockFullData {
  info: MarketData
  indicators: TechnicalIndicators
  recentCandles: { date: string; open: number; high: number; low: number; close: number; volume: number }[]
}

export interface NewsItem {
  title: string
  publisher: string
  link: string
  publishedAt: string
}

export interface MarketContext {
  sp500Trend: string
  vixLevel: number
  sectorPerformance: string
}
```

- [ ] **Step 7: Commit**

```bash
git add api/_lib/
git commit -m "feat: add API infrastructure — config, errors, retry, cache, supabase clients"
```

---

## Phase 4: API Migration

### Task 5: Migrate market-data + news + screenshot modules

**Files:**
- Create: `api/_lib/market-data.ts` (migrate from old project)
- Create: `api/_lib/market-context.ts` (NEW)
- Create: `api/_lib/news.ts` (migrate from old project)
- Create: `api/_lib/screenshot.ts` (migrate from old project)

- [ ] **Step 1: Migrate market-data.ts**

Copy from old project and add:
- Import `withRetry` and `cached` from new modules
- Wrap Yahoo Finance fetch with `withRetry(fn, 3, 'Yahoo Finance')`
- Wrap entire function with `cached(ticker-market, CACHE_TTL_MARKET, fn)`
- Keep all calculation functions (SMA, EMA, RSI, MACD, ATR, Bollinger) as-is
- Update return type to match new `StockFullData` interface

- [ ] **Step 2: Create market-context.ts (NEW)**

`api/_lib/market-context.ts`:
```typescript
import { withRetry } from './retry'
import { cached } from './cache'
import { config } from './config'
import type { MarketContext } from './types'

export async function fetchMarketContext(): Promise<MarketContext | null> {
  return cached('market-context', config.CACHE_TTL_MARKET, async () => {
    try {
      const [sp500, vix] = await Promise.all([
        withRetry(() => fetchYahooQuote('^GSPC'), 2, 'S&P500'),
        withRetry(() => fetchYahooQuote('^VIX'), 2, 'VIX'),
      ])

      const sp500Trend = sp500.changePercent > 0.5 ? 'bullish'
        : sp500.changePercent < -0.5 ? 'bearish' : 'sideways'

      return {
        sp500Trend,
        vixLevel: vix.price,
        sectorPerformance: sp500.changePercent > 0 ? 'positive' : 'negative',
      }
    } catch {
      return null
    }
  })
}

async function fetchYahooQuote(symbol: string): Promise<{ price: number; changePercent: number }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  const data = await res.json()
  const meta = data.chart.result[0].meta
  return {
    price: meta.regularMarketPrice,
    changePercent: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100,
  }
}
```

- [ ] **Step 3: Migrate news.ts**

Copy from old project and add:
- Import `withRetry` from new modules
- Wrap Google News fetch with `withRetry(fn, 2, 'Google News')`
- Keep regex XML parsing as-is
- Return empty array on failure (graceful degradation)

- [ ] **Step 4: Migrate screenshot.ts**

Copy from old project as-is. It just generates Finviz URLs, no logic changes needed.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/market-data.ts api/_lib/market-context.ts api/_lib/news.ts api/_lib/screenshot.ts
git commit -m "feat: migrate market-data, news, screenshot modules with retry + caching"
```

---

### Task 6: Migrate Telegram + tracker + reviewer modules

**Files:**
- Create: `api/_lib/telegram.ts`
- Create: `api/_lib/tracker.ts`
- Create: `api/_lib/reviewer.ts`

- [ ] **Step 1: Migrate telegram.ts**

Copy from old project and update:
- Use `config.TELEGRAM_BOT_TOKEN` and `config.TELEGRAM_CHAT_ID` instead of direct `process.env`
- Add `try/catch` around fetch calls (fire-and-forget pattern)
- Accept optional `chatId` parameter to support per-user notifications in future
- Keep message formatting (Chinese, emojis) as-is

- [ ] **Step 2: Migrate tracker.ts**

Copy from old project and update:
- Use `config.MIN_CONFIDENCE` and `config.MAX_TRACKING_DAYS` instead of hardcoded values
- Use `adminClient` from new supabase module
- Update table column names to match new schema (`analysis_id` instead of `alert_id`, numeric fields instead of text)
- Add `user_id` parameter to `autoTrackTrade`

- [ ] **Step 3: Migrate reviewer.ts**

Copy from old project and update:
- Use `config.ANALYSIS_MODEL` for Claude model
- Use `adminClient` from new supabase module
- Update `getRecentLessons` to filter by relevance:
  - Match by ticker, tags, recency
  - Limit to top 5 by `relevance_score`
  - Increment `times_used` counter
- Accept `userId` and `ticker` parameters for scoped lesson retrieval

- [ ] **Step 4: Commit**

```bash
git add api/_lib/telegram.ts api/_lib/tracker.ts api/_lib/reviewer.ts
git commit -m "feat: migrate telegram, tracker, reviewer modules with configurable params"
```

---

### Task 7: Rebuild Claude AI analysis (two-pass)

**Files:**
- Create: `api/_lib/anthropic.ts`

- [ ] **Step 1: Implement two-pass analysis**

`api/_lib/anthropic.ts` — key changes from old version:
- **Pass 1 (Technical):** chart images + indicators → pattern/trend/support/resistance
- **Pass 2 (Decision):** Pass 1 results + news + market context + lessons → recommendation
- Use `config.ANALYSIS_MODEL` instead of hardcoded model
- Parse response into new `AnalysisResult` type (numeric fields, not text)
- Add `prompt_version` tracking (start at `'v2.0'`)
- Wrap image fetches with `withRetry`
- Return structured numeric data for prices instead of text strings

- [ ] **Step 2: Test with a manual webhook call**

After deploying, send a test POST to `/api/webhook` with a sample alert payload and verify Claude responds with structured analysis.

- [ ] **Step 3: Commit**

```bash
git add api/_lib/anthropic.ts
git commit -m "feat: rebuild Claude analysis with two-pass approach and market context"
```

---

### Task 8: Migrate API route handlers

**Files:**
- Create: `api/webhook.ts`
- Create: `api/alerts/index.ts`
- Create: `api/alerts/[id].ts`
- Create: `api/tracking/index.ts`
- Create: `api/favorites.ts`
- Create: `api/lessons.ts`
- Create: `api/stats.ts`
- Create: `api/cron/check-trades.ts`

- [ ] **Step 1: Rebuild webhook.ts**

Migrate from old project with changes:
- Validate `WEBHOOK_SECRET` header
- Use `adminClient` (no user JWT in TradingView webhooks)
- Need a default `user_id` for webhook-inserted records (fetch from config or first user)
- Add `fetchMarketContext()` to the parallel data fetch
- Pass market context to `analyzeChart`
- Wrap entire handler with `withErrorHandler`

- [ ] **Step 2: Rebuild alerts endpoints**

`api/alerts/index.ts`:
- Use `createUserClient(req)` for RLS
- Add pagination: `limit` (default 20, max 100) and `offset`
- Add filters: `ticker`, `recommendation`, `date_from`, `date_to`
- Join `analyses` table
- Wrap with `withErrorHandler`

`api/alerts/[id].ts`:
- Use `createUserClient(req)` for RLS
- Return alert with all related analyses
- 404 if not found
- Wrap with `withErrorHandler`

- [ ] **Step 3: Rebuild tracking endpoint**

`api/tracking/index.ts`:
- Use `createUserClient(req)` for RLS
- Add optional `status` filter
- Add pagination
- Order by `created_at DESC`
- Wrap with `withErrorHandler`

- [ ] **Step 4: Rebuild favorites endpoint**

`api/favorites.ts`:
- GET: list favorites with joined alert + analysis data
- POST: add favorite with duplicate check (409 if exists)
- DELETE: remove by `alert_id` from query param
- All use `createUserClient(req)`
- Wrap with `withErrorHandler`

- [ ] **Step 5: Rebuild lessons endpoint**

`api/lessons.ts`:
- Use `createUserClient(req)` for RLS
- Add pagination (default 20)
- Add optional tag filter
- Order by `relevance_score DESC, created_at DESC`
- Wrap with `withErrorHandler`

- [ ] **Step 6: Rebuild stats endpoint**

`api/stats.ts`:
- Use `createUserClient(req)` for RLS
- Calculate: total, tracking, success, failed, expired, winRate, avgPnl, totalPnl
- Add optional `date_from`, `date_to` filters
- Wrap with `withErrorHandler`

- [ ] **Step 7: Rebuild cron check-trades**

`api/cron/check-trades.ts`:
- Validate `CRON_SECRET` from `Authorization` header
- Use `adminClient` (no user context)
- Loop through all `status='tracking'` trades with error isolation per trade
- Call `reviewTrade` for failed/expired, `sendTradeResultToTelegram` for resolved
- Return summary
- Wrap with `withErrorHandler`

- [ ] **Step 8: Commit**

```bash
git add api/webhook.ts api/alerts/ api/tracking/ api/favorites.ts api/lessons.ts api/stats.ts api/cron/
git commit -m "feat: migrate all API route handlers with auth, pagination, and error handling"
```

---

## Phase 5: Frontend Foundation

### Task 9: Auth context and login page

**Files:**
- Create: `src/contexts/AuthContext.tsx`
- Create: `src/pages/LoginPage.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create AuthContext**

`src/contexts/AuthContext.tsx`:
```typescript
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

- [ ] **Step 2: Create LoginPage**

`src/pages/LoginPage.tsx` — simple email/password form with toggle between sign in and sign up. Dark theme styling.

- [ ] **Step 3: Update App.tsx with auth + routing**

Wire up `AuthProvider`, protected routes, and all page routes.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/contexts/ src/pages/LoginPage.tsx src/App.tsx
git commit -m "feat: add authentication context, login page, and protected routing"
```

---

### Task 10: Layout components (AppShell, Sidebar, TopNav, MobileNav)

**Files:**
- Create: `src/components/layout/AppShell.tsx`
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/TopNav.tsx`
- Create: `src/components/layout/MobileNav.tsx`

- [ ] **Step 1: Create Sidebar**

Desktop sidebar with navigation links: Dashboard, Alerts, Tracking, Favorites, Lessons, Settings. Use Lucide icons. Highlight active route.

- [ ] **Step 2: Create TopNav**

Top bar with logo text, search input placeholder, notification bell icon.

- [ ] **Step 3: Create MobileNav**

Bottom tab bar (visible only on mobile) with same nav items as sidebar.

- [ ] **Step 4: Create AppShell**

Combines Sidebar + TopNav + main content area. Responsive: sidebar hidden on mobile, MobileNav shown instead.

- [ ] **Step 5: Wire into App.tsx**

Wrap authenticated routes with `<AppShell>`.

- [ ] **Step 6: Verify build + visual check**

```bash
npm run dev
```
Open browser, verify layout renders correctly on desktop and mobile.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/
git commit -m "feat: add responsive layout — sidebar, topnav, mobile nav, app shell"
```

---

### Task 11: React Query hooks

**Files:**
- Create: `src/hooks/useAlerts.ts`
- Create: `src/hooks/useTracking.ts`
- Create: `src/hooks/useLessons.ts`
- Create: `src/hooks/useFavorites.ts`
- Create: `src/hooks/useStats.ts`

- [ ] **Step 1: Create useAlerts hook**

```typescript
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Alert } from '../types'

export function useAlerts(filters?: {
  ticker?: string
  recommendation?: string
  limit?: number
  offset?: number
}) {
  return useQuery({
    queryKey: ['alerts', filters],
    queryFn: async () => {
      let query = supabase
        .from('alerts')
        .select('*, analyses(*)')
        .order('created_at', { ascending: false })
        .limit(filters?.limit ?? 20)

      if (filters?.offset) query = query.range(filters.offset, filters.offset + (filters.limit ?? 20) - 1)
      if (filters?.ticker) query = query.ilike('ticker', `%${filters.ticker}%`)

      const { data, error } = await query
      if (error) throw error
      return data as Alert[]
    },
  })
}

export function useAlert(id: string) {
  return useQuery({
    queryKey: ['alerts', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('*, analyses(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Alert
    },
    enabled: !!id,
  })
}
```

- [ ] **Step 2: Create useTracking, useLessons, useFavorites, useStats hooks**

Follow same pattern — React Query + Supabase client. Each hook maps to its respective table with appropriate filters and joins.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/
git commit -m "feat: add React Query data hooks for all entities"
```

---

## Phase 6: Frontend Pages (After Stitch Designs)

### Task 12: Implement pages from Stitch designs

> **BLOCKED:** Waiting for user to complete Stitch designs. Once designs are provided, implement each page component matching the design.

**Pages to implement:**
- [ ] **Step 1:** DashboardPage — stats bar, top signals, active trades, recent alerts
- [ ] **Step 2:** AlertsPage — filterable list with list/grouped views
- [ ] **Step 3:** AlertDetailPage — full analysis, charts, indicators, actions
- [ ] **Step 4:** TrackingPage — active/resolved trades with status filters
- [ ] **Step 5:** FavoritesPage — saved alerts with notes
- [ ] **Step 6:** LessonsPage — lesson cards with tags and relevance
- [ ] **Step 7:** SettingsPage — Telegram config, thresholds, preferences
- [ ] **Step 8:** Shared UI components (Card, Badge, Modal, Toast, Skeleton, Button, Input)
- [ ] **Step 9:** Verify all pages build and route correctly
- [ ] **Step 10:** Commit

```bash
git add src/pages/ src/components/
git commit -m "feat: implement all frontend pages from Stitch designs"
```

---

## Phase 7: Data Migration

### Task 13: Write data migration script

**Files:**
- Create: `scripts/migrate-data.ts`

- [ ] **Step 1: Write migration script**

`scripts/migrate-data.ts`:
- Connect to OLD Supabase project (env: `OLD_SUPABASE_URL`, `OLD_SUPABASE_KEY`)
- Connect to NEW Supabase project (env: `NEW_SUPABASE_URL`, `NEW_SUPABASE_SERVICE_KEY`)
- Fetch all records from old tables: alerts, analyses, tracked_trades, lessons, favorites
- Transform:
  - Add `user_id` (map to default user in new project)
  - Convert text price fields → NUMERIC
  - Map old `alert_id` on tracked_trades → new `analysis_id`
  - Convert old lesson fields to new structured format
- Insert into new tables
- Log counts and any errors

- [ ] **Step 2: Test migration with dry run**

Add `--dry-run` flag that logs transforms without inserting.

- [ ] **Step 3: Run migration**

```bash
npx tsx scripts/migrate-data.ts
```

- [ ] **Step 4: Verify data integrity**

Compare record counts between old and new. Spot-check a few records.

- [ ] **Step 5: Commit**

```bash
git add scripts/
git commit -m "feat: add data migration script from old to new schema"
```

---

## Phase 8: Deploy & Cutover

### Task 14: Deploy to Vercel

- [ ] **Step 1: Link to Vercel**

```bash
npx vercel link
```

- [ ] **Step 2: Set environment variables**

Add all env vars from `.env.example` to Vercel project settings.

- [ ] **Step 3: Deploy preview**

```bash
npx vercel
```

- [ ] **Step 4: Test all endpoints**

- POST `/api/webhook` with sample alert
- GET `/api/alerts`
- GET `/api/stats`
- Verify Telegram notification received
- Verify frontend loads and auth works

- [ ] **Step 5: Deploy production**

```bash
npx vercel --prod
```

- [ ] **Step 6: Update TradingView webhook URL**

Point TradingView alerts to new Vercel URL.

- [ ] **Step 7: Monitor for 1 week**

Keep old app running as fallback. Monitor new app for errors.

- [ ] **Step 8: Commit any final fixes**

```bash
git add .
git commit -m "fix: post-deploy adjustments"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-2 | Project setup, types, Supabase client |
| 2 | 3 | Database migrations + RLS |
| 3 | 4 | API infrastructure (config, errors, retry, cache) |
| 4 | 5-8 | Migrate all API modules + route handlers |
| 5 | 9-11 | Frontend foundation (auth, layout, hooks) |
| 6 | 12 | Frontend pages (**BLOCKED: waiting for Stitch designs**) |
| 7 | 13 | Data migration script |
| 8 | 14 | Deploy + cutover |

**Total: 14 tasks, ~8 phases**

Phase 1-5 and Phase 7 can proceed now. Phase 6 is blocked on Stitch designs.
