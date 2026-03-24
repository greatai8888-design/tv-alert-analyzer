# TV Alert Analyzer — Core Rebuild Design Spec

**Date:** 2026-03-23
**Sub-project:** 1 of 4 — Core Rebuild
**Approach:** Plan C — New React frontend + migrate/restructure backend logic

---

## Overview

Rebuild the TV Alert Analyzer from a single-file vanilla HTML app into a modern React + TypeScript application with proper authentication, database design, and error handling. The core analysis logic (Claude AI, Yahoo Finance, Telegram) is preserved but restructured.

**Current live URL:** https://tv-alert-analyzer.vercel.app/
**New repo location:** `C:\Users\Omar\Claude Code\claude projects\tv-alert-analyzer`

---

## 1. Project Structure

```
tv-alert-analyzer/
├── src/
│   ├── components/
│   │   ├── ui/              # Button, Modal, Card, Input, Badge, Toast
│   │   ├── dashboard/       # SignalCard, StatsBar, QuickFilters
│   │   ├── alerts/          # AlertList, AlertDetail, AlertFilters
│   │   ├── tracking/        # TradeList, TradeCard, TradeStatus
│   │   ├── lessons/         # LessonList, LessonCard
│   │   └── layout/          # AppShell, Sidebar, TopNav, MobileNav
│   ├── pages/
│   │   ├── DashboardPage.tsx
│   │   ├── AlertsPage.tsx
│   │   ├── AlertDetailPage.tsx
│   │   ├── TrackingPage.tsx
│   │   ├── LessonsPage.tsx
│   │   ├── FavoritesPage.tsx
│   │   ├── SettingsPage.tsx
│   │   └── LoginPage.tsx
│   ├── hooks/
│   │   ├── useAlerts.ts
│   │   ├── useTracking.ts
│   │   ├── useLessons.ts
│   │   ├── useFavorites.ts
│   │   └── useStats.ts
│   ├── lib/
│   │   ├── supabase.ts      # Supabase client singleton
│   │   ├── api.ts           # API helper with error handling
│   │   └── utils.ts         # Formatters, date helpers
│   ├── contexts/
│   │   └── AuthContext.tsx
│   ├── types/
│   │   ├── database.ts      # Supabase generated types
│   │   └── index.ts         # App-level types
│   └── App.tsx
├── api/                      # Vercel Serverless Functions
│   ├── _lib/
│   │   ├── anthropic.ts     # Claude AI analysis (migrated + improved)
│   │   ├── market-data.ts   # Yahoo Finance (migrated + cached)
│   │   ├── news.ts          # News aggregation (migrated + retry)
│   │   ├── reviewer.ts      # AI trade reviewer (migrated)
│   │   ├── screenshot.ts    # Chart URL generation
│   │   ├── supabase.ts      # Server-side Supabase client
│   │   ├── telegram.ts      # Telegram notifications (migrated)
│   │   ├── tracker.ts       # Trade tracker (migrated + configurable)
│   │   ├── types.ts         # Shared API types
│   │   ├── errors.ts        # Error handling utilities
│   │   ├── cache.ts         # Simple in-memory cache with TTL
│   │   └── config.ts        # Environment variable validation
│   ├── webhook.ts           # TradingView webhook endpoint
│   ├── alerts/
│   │   ├── index.ts         # GET /api/alerts (paginated)
│   │   └── [id].ts          # GET /api/alerts/:id
│   ├── tracking/
│   │   └── index.ts         # GET /api/tracking
│   ├── favorites.ts         # GET/POST/DELETE /api/favorites
│   ├── lessons.ts           # GET /api/lessons
│   ├── stats.ts             # GET /api/stats
│   └── cron/
│       └── check-trades.ts  # Cron job: check trade status
├── supabase/
│   └── migrations/          # Numbered SQL migrations
├── scripts/
│   └── migrate-data.ts      # Old → new data migration
├── public/
│   └── favicon.svg
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vercel.json
├── package.json
└── .env.example
```

---

## 2. Database Schema

### 2.1 Users (via Supabase Auth)

Supabase Auth handles user registration/login. A trigger creates a profile row on signup.

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  telegram_chat_id TEXT,          -- per-user Telegram notifications
  settings JSONB DEFAULT '{}',    -- user preferences
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.2 Alerts

```sql
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  exchange TEXT,
  timeframe TEXT,
  price NUMERIC(12,4),
  action TEXT NOT NULL,            -- from TradingView: 'buy', 'sell', 'alert'
  message TEXT,                    -- raw TradingView message
  raw_payload JSONB,              -- full webhook payload
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_alerts_user_id ON alerts(user_id);
CREATE INDEX idx_alerts_ticker ON alerts(ticker);
CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX idx_alerts_action ON alerts(action);
```

### 2.3 Analyses

```sql
CREATE TABLE analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- AI analysis results (numeric, not text)
  recommendation TEXT NOT NULL,    -- 'BUY', 'SELL', 'HOLD'
  confidence INTEGER NOT NULL,     -- 0-100
  summary TEXT NOT NULL,           -- Chinese analysis summary

  -- Price levels
  entry_price NUMERIC(12,4),
  stop_loss NUMERIC(12,4),
  take_profit NUMERIC(12,4),
  support_price NUMERIC(12,4),
  resistance_price NUMERIC(12,4),

  -- Technical data snapshot
  rsi NUMERIC(6,2),
  sma_20 NUMERIC(12,4),
  sma_50 NUMERIC(12,4),
  sma_200 NUMERIC(12,4),
  macd_signal TEXT,                -- 'bullish', 'bearish', 'neutral'
  volume_trend TEXT,               -- 'increasing', 'decreasing', 'stable'

  -- Market context
  market_context JSONB,            -- S&P500 trend, VIX, sector data
  news_context JSONB,              -- news items used in analysis
  chart_urls JSONB,                -- daily, weekly, intraday URLs

  -- AI metadata
  model_used TEXT,                 -- e.g. 'claude-sonnet-4-20250514'
  prompt_version TEXT,             -- track prompt iterations
  raw_response JSONB,             -- full AI response for debugging

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_analyses_alert_id ON analyses(alert_id);
CREATE INDEX idx_analyses_user_id ON analyses(user_id);
CREATE INDEX idx_analyses_recommendation ON analyses(recommendation);
CREATE INDEX idx_analyses_confidence ON analyses(confidence DESC);
CREATE INDEX idx_analyses_created_at ON analyses(created_at DESC);
```

### 2.4 Tracked Trades

```sql
CREATE TABLE tracked_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  recommendation TEXT NOT NULL,    -- 'BUY' or 'SELL'

  -- Price tracking
  entry_price NUMERIC(12,4) NOT NULL,
  current_price NUMERIC(12,4),
  stop_loss NUMERIC(12,4),
  take_profit NUMERIC(12,4),

  -- Status
  status TEXT NOT NULL DEFAULT 'tracking',  -- 'tracking', 'success', 'failed', 'expired'
  pnl_percent NUMERIC(8,4),
  resolved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,

  -- Metadata
  confidence INTEGER NOT NULL,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tracked_trades_user_id ON tracked_trades(user_id);
CREATE INDEX idx_tracked_trades_status ON tracked_trades(status);
CREATE INDEX idx_tracked_trades_ticker ON tracked_trades(ticker);
CREATE INDEX idx_tracked_trades_created_at ON tracked_trades(created_at DESC);
```

### 2.5 Lessons

```sql
CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trade_id UUID REFERENCES tracked_trades(id) ON DELETE SET NULL,

  -- Structured lesson data
  ticker TEXT NOT NULL,
  lesson_type TEXT NOT NULL,       -- 'failed_trade', 'expired_trade', 'missed_signal'
  lesson_text TEXT NOT NULL,
  key_takeaway TEXT NOT NULL,      -- one-line summary for prompt injection
  tags TEXT[] DEFAULT '{}',        -- e.g. ['RSI', 'breakout', 'earnings']

  -- Context snapshot
  original_analysis JSONB,
  market_conditions JSONB,

  -- Relevance
  relevance_score INTEGER DEFAULT 50,  -- 0-100, decays over time
  times_used INTEGER DEFAULT 0,        -- how many times injected into prompts

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_lessons_user_id ON lessons(user_id);
CREATE INDEX idx_lessons_tags ON lessons USING GIN(tags);
CREATE INDEX idx_lessons_relevance ON lessons(relevance_score DESC);
```

### 2.6 Favorites

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

### 2.7 Watchlist (for Sub-project 2, schema defined now)

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

### 2.8 RLS Policies

All tables use user-scoped policies:

```sql
-- Example pattern applied to ALL tables:
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alerts"
  ON alerts FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own alerts"
  ON alerts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Webhook needs service_role to insert (no user context)
-- Use SUPABASE_SERVICE_ROLE_KEY in webhook handler
```

---

## 3. Authentication

### Flow
1. User signs up/logs in via Supabase Auth (email + password)
2. `on_auth_user_created` trigger creates a `profiles` row
3. Frontend stores session via Supabase client (auto-refresh)
4. All API routes validate JWT from `Authorization` header
5. Webhook endpoint uses API key auth (for TradingView, no user session)

### Frontend Auth
- `AuthContext.tsx` provides `user`, `loading`, `signIn`, `signUp`, `signOut`
- `<ProtectedRoute>` wrapper redirects to login if unauthenticated
- Login page: email/password form, no OAuth initially

### API Auth
- `api/_lib/supabase.ts` exports two clients:
  - `createUserClient(req)` — extracts JWT, creates user-scoped client
  - `adminClient` — uses service role key (for webhook, cron)

---

## 4. API Architecture

### Error Handling

```typescript
// Consistent error response
interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}

// All endpoints wrapped with error handler
function withErrorHandler(handler: Handler): Handler {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (err) {
      console.error(JSON.stringify({ error: err.message, stack: err.stack, url: req.url }));
      return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  };
}
```

### Retry Logic

```typescript
// For external APIs (Yahoo Finance, Google News, Finviz)
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await sleep(Math.pow(2, i) * 1000); // exponential backoff
    }
  }
}
```

### Caching

```typescript
// Simple in-memory cache for market data and news
// TTL: market data = 5 min, news = 15 min
const cache = new Map<string, { data: unknown; expires: number }>();

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return entry.data as T;
  const result = await fn();
  cache.set(key, { data: result, expires: Date.now() + ttlMs });
  return result;
}
```

### Configuration

```typescript
// api/_lib/config.ts — all configurable values
export const config = {
  MIN_CONFIDENCE: parseInt(process.env.MIN_CONFIDENCE || '60'),
  MAX_TRACKING_DAYS: parseInt(process.env.MAX_TRACKING_DAYS || '7'),
  CACHE_TTL_MARKET: parseInt(process.env.CACHE_TTL_MARKET || '300000'),  // 5 min
  CACHE_TTL_NEWS: parseInt(process.env.CACHE_TTL_NEWS || '900000'),      // 15 min
  ANALYSIS_MODEL: process.env.ANALYSIS_MODEL || 'claude-sonnet-4-20250514',
};
```

### Endpoints Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/webhook | API Key | TradingView webhook receiver |
| GET | /api/alerts | JWT | List alerts (paginated) |
| GET | /api/alerts/:id | JWT | Get alert with analyses |
| GET | /api/tracking | JWT | List tracked trades |
| GET | /api/favorites | JWT | List favorites |
| POST | /api/favorites | JWT | Add favorite |
| DELETE | /api/favorites | JWT | Remove favorite |
| GET | /api/lessons | JWT | List lessons |
| GET | /api/stats | JWT | Trading statistics |
| GET | /api/cron/check-trades | Cron secret | Check & resolve trades |

---

## 5. AI Analysis Improvements

### 5.1 Better Prompt Structure

Current problems:
- Single monolithic prompt tries to do everything
- Confidence scores are inconsistent
- Missing broader market context

New approach — **two-pass analysis:**

**Pass 1: Technical Analysis**
- Input: chart images (daily, weekly, intraday), technical indicators, volume
- Output: pattern recognition, support/resistance, trend direction
- Focus: pure technical data, no opinion

**Pass 2: Decision Synthesis**
- Input: Pass 1 results + news + market context + relevant lessons
- Output: BUY/SELL/HOLD recommendation with confidence, entry/exit prices
- Focus: weighing all factors, considering risk

### 5.2 Market Context

Add to analysis prompt:
- S&P 500 / QQQ trend (bullish/bearish/sideways)
- VIX level (fear gauge)
- Sector ETF performance (e.g., XLK for tech stocks)
- Market-wide signals help avoid buying in a downturn

### 5.3 Lesson Injection

Current: dumps all lessons into prompt
New approach:
- Filter lessons by relevance: same ticker, same sector, similar pattern
- Weight by recency: newer lessons score higher
- Limit to top 5 most relevant lessons
- Track `times_used` to measure lesson effectiveness

### 5.4 Confidence Calibration

Track accuracy over time:
- After trade resolves, compare predicted confidence vs actual outcome
- Build a calibration table: "when AI says 75% confidence, actual win rate is X%"
- Use this to adjust displayed confidence in the UI
- Stored in `stats` endpoint response

---

## 6. Frontend Design

### 6.1 Theme

- **Dark theme** — standard for trading apps (dark navy/charcoal background)
- Accent colors: green for BUY/profit, red for SELL/loss, amber for HOLD/neutral
- Font: Inter or system font stack
- Tailwind CSS with custom theme config

### 6.2 Layout

```
┌──────────────────────────────────────────┐
│  TopNav: Logo | Search | Notifications   │
├────────┬─────────────────────────────────┤
│        │                                 │
│  Side  │     Main Content Area           │
│  bar   │                                 │
│        │                                 │
│  Dashboard                               │
│  Alerts                                  │
│  Tracking                                │
│  Favorites                               │
│  Lessons                                 │
│  Settings                                │
│        │                                 │
└────────┴─────────────────────────────────┘
```

Mobile: sidebar collapses to bottom tab bar.

### 6.3 Pages

**Dashboard (landing page)**
- Stats bar: total trades, win rate, avg PnL, active tracking count
- "Top Signals" — latest BUY recommendations sorted by confidence
- "Active Trades" — currently tracking trades with live P&L
- "Recent Alerts" — latest 10 alerts

**Alerts**
- List view with filters: recommendation (BUY/SELL/HOLD), date range, ticker search
- Ticker-grouped view option
- Click to expand full analysis

**Alert Detail**
- Full analysis text
- Chart images (daily, weekly, intraday)
- Technical indicators display
- News context
- Favorite toggle
- Track button (if not already tracking)

**Tracking**
- Active trades with live status
- Resolved trades history
- Filter by status (tracking, success, failed, expired)

**Favorites**
- Saved alerts with notes
- Quick actions: view analysis, start tracking

**Lessons**
- List of AI-generated lessons
- Tags for filtering
- Relevance score indicator

**Settings**
- Telegram chat ID configuration
- Notification preferences
- MIN_CONFIDENCE threshold
- MAX_TRACKING_DAYS

### 6.4 Component Patterns

- React Query for all data fetching
- Optimistic updates for favorites
- Toast notifications for actions
- Skeleton loading states
- Error boundaries with retry

---

## 7. Data Migration Strategy

### 7.1 Steps

1. Export all data from old Supabase project via SQL dump or API
2. Transform data to match new schema:
   - Add `user_id` to all records (assign to first/default user)
   - Convert text price fields to NUMERIC
   - Parse analysis text fields into structured columns
   - Map old status values to new enum
3. Import into new Supabase project via migration script
4. Verify record counts and data integrity
5. Run comparison queries on old vs new

### 7.2 Migration Script

```typescript
// scripts/migrate-data.ts
// 1. Connect to old Supabase
// 2. Fetch all alerts, analyses, tracked_trades, lessons, favorites
// 3. Transform each record
// 4. Insert into new Supabase
// 5. Log results and any errors
```

### 7.3 Cutover Plan

1. Deploy new app to separate Vercel project
2. Test with migrated data
3. Update TradingView webhook URL to new endpoint
4. Keep old app running for 1 week as fallback
5. Decommission old app

---

## 8. Environment Variables

```env
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI
ANTHROPIC_API_KEY=
ANALYSIS_MODEL=claude-sonnet-4-20250514

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Trading Config
MIN_CONFIDENCE=60
MAX_TRACKING_DAYS=7
CACHE_TTL_MARKET=300000
CACHE_TTL_NEWS=900000

# Webhook Auth
WEBHOOK_SECRET=

# Cron Auth
CRON_SECRET=

# Vercel
VERCEL_URL=
```

---

## 9. Error Handling Strategy

### API Level
- All endpoints wrapped in `withErrorHandler`
- Consistent error response format: `{ error, code, details? }`
- Structured JSON logging (timestamp, error, stack, request context)

### External Services
- **Yahoo Finance:** retry 3x with exponential backoff, fallback to cached data
- **Google News:** retry 2x, graceful skip if fails (analysis continues without news)
- **Finviz charts:** retry 2x, fallback to text-only analysis
- **Claude API:** retry 2x, return partial analysis if second attempt fails
- **Telegram:** fire-and-forget with error logging (don't block main flow)

### Frontend
- React Error Boundaries at page level
- Toast notifications for user-facing errors
- Retry buttons on failed data fetches
- Offline detection banner

---

## 10. Testing Strategy

### Unit Tests (Vitest)
- Market data calculations (SMA, RSI, MACD, Bollinger Bands)
- Price parsing and formatting utilities
- Config validation
- Cache logic

### Integration Tests
- API endpoints with mocked Supabase
- Webhook processing flow
- Trade tracking state machine (tracking → success/failed/expired)

### Manual Testing Checklist
- [ ] TradingView webhook fires and creates alert + analysis
- [ ] Telegram notification received with correct format
- [ ] Dashboard shows latest signals
- [ ] Alert detail displays all analysis data
- [ ] Favorites add/remove works
- [ ] Trade tracking auto-resolves correctly
- [ ] Lessons generated from failed trades
- [ ] Auth flow: signup → login → protected routes
- [ ] Mobile responsive layout

---

## Future Sub-projects (out of scope for Core Rebuild)

These are designed in separate specs:

- **Sub-project 2: Smart Dashboard** — signal ranking board, watchlist, advanced filters
- **Sub-project 3: Paper Trading** — simulated buy/sell, calendar view, P&L tracking
- **Sub-project 4: AI Trading Bot** — multi-factor decision engine, position sizing, risk management
