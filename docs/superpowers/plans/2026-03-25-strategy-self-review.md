# Strategy Self-Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an alert outcome tracking + weekly AI strategy review system that identifies hits, misses, and missed opportunities.

**Architecture:** Daily cron fills price data for each alert at 1d/3d/7d intervals, classifies outcomes. Weekly cron generates AI review report analyzing systemic blind spots. Frontend page displays reviews.

**Tech Stack:** PostgreSQL (Supabase), Vercel Serverless Functions (TypeScript), Claude AI, React + TanStack Query

**Spec:** `docs/superpowers/specs/2026-03-25-strategy-self-review-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `supabase/migrations/010_strategy_review.sql` | **New** — `alert_outcomes` + `strategy_reviews` tables, indexes, trigger, RLS |
| `api/_lib/outcome-tracker.ts` | **New** — `updateAlertOutcomes()` + `generateWeeklyReview()` |
| `api/cron/check-trades.ts` | **Edit** — Add `updateAlertOutcomes()` call |
| `api/cron/weekly-review.ts` | **New** — Weekly cron endpoint |
| `api/webhook.ts` | **Edit** — Insert initial `alert_outcomes` row |
| `vercel.json` | **Edit** — Add weekly cron schedule |
| `src/hooks/useStrategyReviews.ts` | **New** — Read hooks for reviews and outcomes |
| `src/pages/ReviewsPage.tsx` | **New** — Strategy review page |
| `src/components/layout/Sidebar.tsx` | **Edit** — Add nav item |
| `src/components/layout/MobileNav.tsx` | **Edit** — Add nav item |
| `src/App.tsx` | **Edit** — Add route |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/010_strategy_review.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/010_strategy_review.sql`:

```sql
-- ============================================================
-- 010_strategy_review.sql — Alert outcomes tracking + weekly reviews
-- ============================================================

-- ─── alert_outcomes ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alert_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES alerts(id) ON DELETE CASCADE UNIQUE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  alert_price numeric(12,4) NOT NULL,
  alert_date timestamptz NOT NULL,
  ai_recommendation text,
  ai_confidence integer,
  ai_reasoning text,
  price_after_1d numeric(12,4),
  price_after_3d numeric(12,4),
  price_after_7d numeric(12,4),
  change_pct_1d numeric(8,2),
  change_pct_3d numeric(8,2),
  change_pct_7d numeric(8,2),
  outcome_category text CHECK (outcome_category IN ('hit', 'miss', 'marginal', 'missed_opportunity', 'correct_skip')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER alert_outcomes_updated_at
  BEFORE UPDATE ON alert_outcomes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_alert_outcomes_user
  ON alert_outcomes (user_id, alert_date DESC);

CREATE INDEX IF NOT EXISTS idx_alert_outcomes_category
  ON alert_outcomes (outcome_category)
  WHERE outcome_category IS NOT NULL;

ALTER TABLE alert_outcomes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY alert_outcomes_select ON alert_outcomes
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── strategy_reviews ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS strategy_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  review_period_start date NOT NULL,
  review_period_end date NOT NULL,
  total_alerts integer NOT NULL DEFAULT 0,
  hits integer NOT NULL DEFAULT 0,
  misses integer NOT NULL DEFAULT 0,
  missed_opportunities integer NOT NULL DEFAULT 0,
  correct_skips integer NOT NULL DEFAULT 0,
  hit_rate numeric(5,2) DEFAULT 0,
  missed_opportunity_rate numeric(5,2) DEFAULT 0,
  top_missed jsonb,
  top_misses jsonb,
  ai_analysis text,
  recommendations jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_strategy_reviews_unique_period
  ON strategy_reviews (user_id, review_period_start, review_period_end);

CREATE INDEX IF NOT EXISTS idx_strategy_reviews_user
  ON strategy_reviews (user_id, review_period_end DESC);

ALTER TABLE strategy_reviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY strategy_reviews_select ON strategy_reviews
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

- [ ] **Step 2: Apply the migration**

Use Supabase MCP `apply_migration` with project_id `kkipwwdvctovnkblnodb`, name `010_strategy_review`.

- [ ] **Step 3: Verify tables exist**

```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('alert_outcomes', 'strategy_reviews');
```

Expected: 2 rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/010_strategy_review.sql
git commit -m "feat(db): add alert_outcomes and strategy_reviews tables for strategy self-review"
```

---

## Task 2: Outcome Tracker Module

**Files:**
- Create: `api/_lib/outcome-tracker.ts`

**Context:** This module has two functions. `updateAlertOutcomes()` is called daily to fill 1d/3d/7d prices. `generateWeeklyReview()` calls Claude AI to produce a strategy review. It imports `adminClient` from `./supabase.js`, `fetchStockData` from `./market-data.js`, `config` from `./config.js`, and `sendAnalysisToTelegram`-style function from `./telegram.js`. The Anthropic client pattern can be seen in `api/_lib/reviewer.ts`.

- [ ] **Step 1: Create the file**

Write `api/_lib/outcome-tracker.ts`:

```typescript
/**
 * Outcome Tracker: tracks alert price performance and generates weekly AI reviews.
 */

import Anthropic from '@anthropic-ai/sdk'
import { adminClient } from './supabase.js'
import { fetchStockData } from './market-data.js'
import { config } from './config.js'

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY })

// ─── Daily: update alert outcomes ───────────────────────────

export async function updateAlertOutcomes(): Promise<{ updated: number; classified: number }> {
  const now = Date.now()
  const DAY = 24 * 60 * 60 * 1000

  // Find outcomes needing 1d, 3d, or 7d price updates
  const { data: pending } = await adminClient
    .from('alert_outcomes')
    .select('id, ticker, alert_price, alert_date, ai_recommendation, price_after_1d, price_after_3d, price_after_7d, change_pct_7d')
    .or('price_after_1d.is.null,price_after_3d.is.null,price_after_7d.is.null')

  if (!pending || pending.length === 0) return { updated: 0, classified: 0 }

  // Collect unique tickers
  const tickers = [...new Set(pending.map(p => p.ticker))]

  // Fetch prices in batches of 5
  const priceMap = new Map<string, number>()
  for (let i = 0; i < tickers.length; i += 5) {
    const batch = tickers.slice(i, i + 5)
    const results = await Promise.all(
      batch.map(async t => {
        const data = await fetchStockData(t)
        return { ticker: t, price: data?.info.price ?? null }
      })
    )
    for (const r of results) {
      if (r.price != null) priceMap.set(r.ticker, r.price)
    }
  }

  let updated = 0
  let classified = 0

  for (const outcome of pending) {
    const currentPrice = priceMap.get(outcome.ticker)
    if (currentPrice == null) continue

    const alertDate = new Date(outcome.alert_date).getTime()
    const alertPrice = Number(outcome.alert_price)
    const daysSince = (now - alertDate) / DAY
    const updates: Record<string, unknown> = {}

    const changePct = (p: number) => Math.round(((p - alertPrice) / alertPrice) * 10000) / 100

    // Fill 1d price (window: 1-2 days after alert)
    if (outcome.price_after_1d == null && daysSince >= 1 && daysSince < 2) {
      updates.price_after_1d = currentPrice
      updates.change_pct_1d = changePct(currentPrice)
    }

    // Fill 3d price (window: 3-4 days after alert)
    if (outcome.price_after_3d == null && daysSince >= 3 && daysSince < 4) {
      updates.price_after_3d = currentPrice
      updates.change_pct_3d = changePct(currentPrice)
    }

    // Fill 7d price (7+ days, no upper bound — terminal point)
    if (outcome.price_after_7d == null && daysSince >= 7) {
      updates.price_after_7d = currentPrice
      updates.change_pct_7d = changePct(currentPrice)
    }

    if (Object.keys(updates).length === 0) continue

    // Classify if 7d data is now available
    if (updates.price_after_7d != null || outcome.price_after_7d != null) {
      const changePct7d = (updates.change_pct_7d as number) ?? Number(outcome.change_pct_7d ?? 0)
      updates.outcome_category = classifyOutcome(outcome.ai_recommendation, changePct7d)
      classified++
    }

    await adminClient
      .from('alert_outcomes')
      .update(updates)
      .eq('id', outcome.id)

    updated++
  }

  return { updated, classified }
}

function classifyOutcome(rec: string | null, changePct7d: number): string {
  if (rec === 'BUY') {
    if (changePct7d >= 2) return 'hit'
    if (changePct7d >= 0) return 'marginal'
    return 'miss'
  }
  if (rec === 'SELL') return 'correct_skip'
  // HOLD or NULL
  if (changePct7d >= 5) return 'missed_opportunity'
  return 'correct_skip'
}

// ─── Weekly: generate strategy review ───────────────────────

export async function generateWeeklyReview(userId: string): Promise<boolean> {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const periodStart = weekAgo.toISOString().split('T')[0]
  const periodEnd = now.toISOString().split('T')[0]

  // Get classified outcomes from the past 7 days
  const { data: outcomes } = await adminClient
    .from('alert_outcomes')
    .select('*')
    .eq('user_id', userId)
    .not('outcome_category', 'is', null)
    .gte('updated_at', weekAgo.toISOString())
    .lte('updated_at', now.toISOString())

  if (!outcomes || outcomes.length === 0) {
    console.log(`[REVIEW] No classified outcomes for user ${userId}, skipping`)
    return false
  }

  // Count categories
  const hits = outcomes.filter(o => o.outcome_category === 'hit').length
  const misses = outcomes.filter(o => o.outcome_category === 'miss').length
  const marginals = outcomes.filter(o => o.outcome_category === 'marginal').length
  const missedOpps = outcomes.filter(o => o.outcome_category === 'missed_opportunity').length
  const correctSkips = outcomes.filter(o => o.outcome_category === 'correct_skip').length
  const total = outcomes.length
  const totalBuy = hits + misses + marginals
  const hitRate = totalBuy > 0 ? Math.round((hits / totalBuy) * 10000) / 100 : 0
  const missedRate = (total - totalBuy) > 0 ? Math.round((missedOpps / (total - totalBuy)) * 10000) / 100 : 0

  // Build details for missed opportunities
  const missedDetails = outcomes
    .filter(o => o.outcome_category === 'missed_opportunity')
    .sort((a, b) => Number(b.change_pct_7d) - Number(a.change_pct_7d))
    .slice(0, 10)
    .map(o => `- ${o.ticker}: alert 價格 $${o.alert_price} → 7天後漲 ${o.change_pct_7d}%\n  AI 判斷: ${o.ai_recommendation || '無'} (信心度 ${o.ai_confidence ?? '—'}%)\n  原因: ${o.ai_reasoning || '無分析記錄'}`)
    .join('\n')

  // Build details for misses
  const missDetails = outcomes
    .filter(o => o.outcome_category === 'miss')
    .sort((a, b) => Number(a.change_pct_7d) - Number(b.change_pct_7d))
    .slice(0, 10)
    .map(o => `- ${o.ticker}: alert 價格 $${o.alert_price} → 7天後跌 ${o.change_pct_7d}%\n  AI 信心度: ${o.ai_confidence ?? '—'}%`)
    .join('\n')

  const prompt = `你是一個資深交易策略檢討分析師。以下是本週（${periodStart} 至 ${periodEnd}）的 AI 交易表現數據。

## 統計摘要
- 總 alert 數: ${total}
- 命中 (BUY 且漲 ≥2%): ${hits} (${hitRate}%)
- 邊緣 (BUY 且漲 0-2%): ${marginals}
- 誤判 (BUY 且跌): ${misses}
- 漏掉 (未選但漲 ≥5%): ${missedOpps} (${missedRate}%)
- 正確忽略: ${correctSkips}

## 漏掉的機會（詳細）
${missedDetails || '無'}

## 誤判的交易（詳細）
${missDetails || '無'}

## 請分析（繁體中文，JSON 格式）：
{
  "ai_analysis": "2-3段完整分析：AI 本週的表現概述、系統性盲點分析、最大的改進空間",
  "recommendations": [
    {
      "suggestion": "具體可操作的建議",
      "reasoning": "為什麼這個改變會有幫助",
      "priority": "high | medium | low"
    }
  ]
}`

  try {
    const response = await anthropic.messages.create({
      model: config.ANALYSIS_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
    const text = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[REVIEW] Failed to parse AI response')
      return false
    }

    const parsed = JSON.parse(jsonMatch[0])

    // Build top arrays for storage
    const topMissed = outcomes
      .filter(o => o.outcome_category === 'missed_opportunity')
      .sort((a, b) => Number(b.change_pct_7d) - Number(a.change_pct_7d))
      .slice(0, 5)
      .map(o => ({ ticker: o.ticker, change_pct_7d: o.change_pct_7d, reason: o.ai_reasoning || '無分析' }))

    const topMisses = outcomes
      .filter(o => o.outcome_category === 'miss')
      .sort((a, b) => Number(a.change_pct_7d) - Number(b.change_pct_7d))
      .slice(0, 5)
      .map(o => ({ ticker: o.ticker, change_pct_7d: o.change_pct_7d, ai_confidence: o.ai_confidence }))

    await adminClient.from('strategy_reviews').upsert({
      user_id: userId,
      review_period_start: periodStart,
      review_period_end: periodEnd,
      total_alerts: total,
      hits,
      misses,
      missed_opportunities: missedOpps,
      correct_skips: correctSkips,
      hit_rate: hitRate,
      missed_opportunity_rate: missedRate,
      top_missed: topMissed,
      top_misses: topMisses,
      ai_analysis: parsed.ai_analysis || '',
      recommendations: parsed.recommendations || [],
    }, { onConflict: 'user_id,review_period_start,review_period_end' })

    console.log(`[REVIEW] Generated review for ${periodStart}-${periodEnd}: ${hits} hits, ${misses} misses, ${missedOpps} missed opps`)
    return true
  } catch (e: any) {
    console.error('[REVIEW] AI review error:', e.message)
    return false
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add api/_lib/outcome-tracker.ts
git commit -m "feat(api): add outcome-tracker module for daily price tracking and weekly AI review"
```

---

## Task 3: Integrate into Daily Cron + Webhook

**Files:**
- Modify: `api/cron/check-trades.ts`
- Modify: `api/webhook.ts`

- [ ] **Step 1: Add outcome tracking to daily cron**

In `api/cron/check-trades.ts`, add import at top:

```typescript
import { updateAlertOutcomes } from '../_lib/outcome-tracker.js'
```

Add before the `return res.status(200).json(...)` at the end:

```typescript
  // Update alert outcomes (1d/3d/7d price tracking)
  let outcomeResults = { updated: 0, classified: 0 }
  try {
    outcomeResults = await updateAlertOutcomes()
    if (outcomeResults.updated > 0) {
      console.log(`[OUTCOMES] Updated: ${outcomeResults.updated}, Classified: ${outcomeResults.classified}`)
    }
  } catch (err: any) {
    console.error('[OUTCOMES] Error:', err.message)
  }
```

Add `outcomes: outcomeResults` to the response JSON.

- [ ] **Step 2: Add initial outcome row to webhook**

In `api/webhook.ts`, add after the Telegram notification block (around line 115), before the `return res.status(200)`:

```typescript
  // Create initial alert outcome for tracking
  if (alertRecord) {
    adminClient.from('alert_outcomes').upsert({
      alert_id: alertRecord.id,
      user_id: userId,
      ticker,
      alert_price: parseFloat(price) || 0,
      alert_date: alertRecord.created_at,
      ai_recommendation: analysis.recommendation,
      ai_confidence: analysis.confidence,
      ai_reasoning: analysis.summary || null,
    }, { onConflict: 'alert_id', ignoreDuplicates: true }).catch(e =>
      console.error('[OUTCOMES] Initial insert error:', e.message)
    )
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add api/cron/check-trades.ts api/webhook.ts
git commit -m "feat(api): integrate outcome tracking into daily cron and webhook"
```

---

## Task 4: Weekly Review Cron

**Files:**
- Create: `api/cron/weekly-review.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create the weekly review cron endpoint**

Write `api/cron/weekly-review.ts`:

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withErrorHandler } from '../_lib/errors.js'
import { config } from '../_lib/config.js'
import { adminClient } from '../_lib/supabase.js'
import { generateWeeklyReview } from '../_lib/outcome-tracker.js'

export default withErrorHandler(async (req: VercelRequest, res: VercelResponse) => {
  // Validate cron secret
  const authHeader = req.headers.authorization
  if (config.CRON_SECRET && authHeader !== `Bearer ${config.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
  }

  // Get all users with profiles
  const { data: users } = await adminClient
    .from('profiles')
    .select('id')

  if (!users || users.length === 0) {
    return res.status(200).json({ message: 'No users found', reviews: 0 })
  }

  const results = []
  for (const user of users) {
    try {
      const success = await generateWeeklyReview(user.id)
      results.push({ userId: user.id, success })
    } catch (err: any) {
      console.error(`[REVIEW] Error for user ${user.id}:`, err.message)
      results.push({ userId: user.id, success: false, error: err.message })
    }
  }

  const generated = results.filter(r => r.success).length
  console.log(`[REVIEW] Weekly review complete: ${generated}/${users.length} users`)

  return res.status(200).json({
    reviewed: users.length,
    generated,
    results,
  })
})
```

- [ ] **Step 2: Add cron schedule to vercel.json**

In `vercel.json`, add to the `crons` array:

```json
{ "path": "/api/cron/weekly-review", "schedule": "0 15 * * 0" }
```

(15:00 UTC = 10:00 AM EST, every Sunday)

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add api/cron/weekly-review.ts vercel.json
git commit -m "feat(api): add weekly strategy review cron job"
```

---

## Task 5: Frontend Hooks

**Files:**
- Create: `src/hooks/useStrategyReviews.ts`

- [ ] **Step 1: Create the hooks file**

Write `src/hooks/useStrategyReviews.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface StrategyReview {
  id: string
  user_id: string
  review_period_start: string
  review_period_end: string
  total_alerts: number
  hits: number
  misses: number
  missed_opportunities: number
  correct_skips: number
  hit_rate: number
  missed_opportunity_rate: number
  top_missed: Array<{ ticker: string; change_pct_7d: number; reason: string }> | null
  top_misses: Array<{ ticker: string; change_pct_7d: number; ai_confidence: number }> | null
  ai_analysis: string | null
  recommendations: Array<{ suggestion: string; reasoning: string; priority: string }> | null
  created_at: string
}

export interface AlertOutcome {
  id: string
  alert_id: string
  ticker: string
  alert_price: number
  alert_date: string
  ai_recommendation: string | null
  ai_confidence: number | null
  ai_reasoning: string | null
  change_pct_1d: number | null
  change_pct_3d: number | null
  change_pct_7d: number | null
  outcome_category: string | null
  created_at: string
}

export function useStrategyReviews() {
  return useQuery({
    queryKey: ['strategy_reviews'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strategy_reviews')
        .select('*')
        .order('review_period_end', { ascending: false })
        .limit(20)
      if (error) throw error
      return data as StrategyReview[]
    },
  })
}

export function useAlertOutcomes(periodStart?: string, periodEnd?: string) {
  return useQuery({
    queryKey: ['alert_outcomes', periodStart, periodEnd],
    enabled: !!periodStart && !!periodEnd,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alert_outcomes')
        .select('*')
        .gte('alert_date', periodStart!)
        .lte('alert_date', periodEnd!)
        .not('outcome_category', 'is', null)
        .order('change_pct_7d', { ascending: false })
      if (error) throw error
      return data as AlertOutcome[]
    },
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useStrategyReviews.ts
git commit -m "feat(hooks): add useStrategyReviews and useAlertOutcomes hooks"
```

---

## Task 6: Reviews Page

**Files:**
- Create: `src/pages/ReviewsPage.tsx`

- [ ] **Step 1: Create the reviews page**

Write `src/pages/ReviewsPage.tsx`:

```tsx
import { useState } from 'react'
import { useStrategyReviews } from '../hooks/useStrategyReviews'
import type { StrategyReview } from '../hooks/useStrategyReviews'
import { formatPrice } from '../lib/utils'

function priorityBadge(priority: string) {
  switch (priority) {
    case 'high': return 'bg-tertiary-light text-tertiary-dark border border-tertiary/20'
    case 'medium': return 'bg-warning-light text-warning-dark border border-warning/20'
    case 'low': return 'bg-surface text-on-surface-variant border border-border'
    default: return 'bg-surface text-on-surface-variant border border-border'
  }
}

function priorityLabel(priority: string) {
  switch (priority) {
    case 'high': return '高'
    case 'medium': return '中'
    case 'low': return '低'
    default: return priority
  }
}

function categoryBadge(category: string) {
  switch (category) {
    case 'hit': return 'bg-primary-light text-primary-dark'
    case 'marginal': return 'bg-warning-light text-warning-dark'
    case 'miss': return 'bg-tertiary-light text-tertiary-dark'
    case 'missed_opportunity': return 'bg-secondary-light text-secondary-dark'
    default: return 'bg-surface text-on-surface-variant'
  }
}

function StatCard({ label, value, borderColor }: { label: string; value: string | number; borderColor: string }) {
  return (
    <div className={`bg-white border border-border border-l-4 ${borderColor} rounded-xl px-5 py-4`}>
      <p className="text-sm text-on-surface-variant mb-1">{label}</p>
      <p className="serif-heading text-[36px] leading-none text-on-surface">{value}</p>
    </div>
  )
}

function ReviewCard({ review }: { review: StrategyReview }) {
  const [expanded, setExpanded] = useState(false)
  const start = new Date(review.review_period_start).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
  const end = new Date(review.review_period_end).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })

  return (
    <div className="bg-white rounded-xl border border-border editorial-shadow">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-5 flex items-start justify-between gap-4"
      >
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="serif-heading text-lg text-on-surface">{start} — {end}</h3>
            <span className="mono-data text-[11px] text-on-surface-variant">{review.total_alerts} alerts</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-primary-light text-primary-dark border border-primary/20 font-medium">
              命中 {review.hits}
            </span>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-tertiary-light text-tertiary-dark border border-tertiary/20 font-medium">
              誤判 {review.misses}
            </span>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-secondary-light text-secondary-dark border border-secondary/20 font-medium">
              漏掉 {review.missed_opportunities}
            </span>
          </div>
          {/* AI analysis preview */}
          {review.ai_analysis && !expanded && (
            <p className="mt-3 text-[13px] text-on-surface-variant line-clamp-2">{review.ai_analysis}</p>
          )}
        </div>
        <span className="material-symbols-outlined text-on-surface-variant transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}>
          expand_more
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-border pt-4 space-y-5">
          {/* AI Analysis */}
          {review.ai_analysis && (
            <div>
              <h4 className="text-sm font-semibold text-on-surface mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>auto_awesome</span>
                AI 分析
              </h4>
              <p className="text-[13px] text-on-surface leading-relaxed whitespace-pre-line">{review.ai_analysis}</p>
            </div>
          )}

          {/* Recommendations */}
          {review.recommendations && review.recommendations.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-on-surface mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-warning" style={{ fontSize: 18 }}>lightbulb</span>
                改進建議
              </h4>
              <div className="space-y-2">
                {review.recommendations.map((rec, i) => (
                  <div key={i} className="bg-surface rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${priorityBadge(rec.priority)}`}>
                        {priorityLabel(rec.priority)}
                      </span>
                      <div>
                        <p className="text-[13px] text-on-surface font-medium">{rec.suggestion}</p>
                        <p className="text-[12px] text-on-surface-variant mt-1">{rec.reasoning}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missed Opportunities */}
          {review.top_missed && review.top_missed.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-on-surface mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary" style={{ fontSize: 18 }}>trending_up</span>
                漏掉的機會
              </h4>
              <div className="bg-white rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm min-w-[400px]">
                  <thead>
                    <tr className="bg-surface border-b border-border">
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">股票</th>
                      <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">7天漲幅</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">AI 原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.top_missed.map((m, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-semibold text-on-surface">{m.ticker}</td>
                        <td className="px-3 py-2 mono-data text-primary-dark text-right font-semibold">+{m.change_pct_7d}%</td>
                        <td className="px-3 py-2 text-xs text-on-surface-variant">{m.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top Misses */}
          {review.top_misses && review.top_misses.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-on-surface mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-tertiary" style={{ fontSize: 18 }}>trending_down</span>
                誤判的交易
              </h4>
              <div className="flex flex-wrap gap-2">
                {review.top_misses.map((m, i) => (
                  <div key={i} className="bg-tertiary-light rounded-lg px-3 py-2 border border-tertiary/20">
                    <span className="font-semibold text-sm text-on-surface">{m.ticker}</span>
                    <span className="mono-data text-xs text-tertiary ml-2">{m.change_pct_7d}%</span>
                    <span className="text-xs text-on-surface-variant ml-2">信心度 {m.ai_confidence}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ReviewsPage() {
  const { data: reviews = [], isLoading } = useStrategyReviews()
  const latest = reviews[0]

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="serif-heading text-[36px] md:text-[44px] leading-tight text-on-surface">策略檢討</h1>
        <p className="mt-2 text-[14px] text-on-surface-variant">AI 每週自動分析交易表現，找出盲點與改進方向</p>
      </div>

      {/* Latest Stats */}
      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard label="總 Alert 數" value={latest.total_alerts} borderColor="border-l-on-surface" />
          <StatCard label="命中率" value={`${latest.hit_rate}%`} borderColor="border-l-primary" />
          <StatCard label="漏掉率" value={`${latest.missed_opportunity_rate}%`} borderColor="border-l-secondary" />
          <StatCard label="正確忽略" value={latest.correct_skips} borderColor="border-l-info" />
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 text-on-surface-variant text-sm gap-2">
          <span className="material-symbols-outlined animate-spin" style={{ fontSize: 20 }}>refresh</span>
          載入中...
        </div>
      )}

      {/* Reviews List */}
      {!isLoading && reviews.length > 0 && (
        <div className="space-y-4">
          {reviews.map(review => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && reviews.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-20 h-20 rounded-full bg-surface flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 40 }}>assessment</span>
          </div>
          <h2 className="serif-heading text-[24px] text-on-surface">尚無策略檢討報告</h2>
          <p className="text-[14px] text-on-surface-variant max-w-sm leading-relaxed">
            每週日系統會自動分析所有 alert 的後續表現，並生成 AI 檢討報告。請等待第一份報告生成。
          </p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/pages/ReviewsPage.tsx
git commit -m "feat(ui): add ReviewsPage with weekly strategy review display"
```

---

## Task 7: Navigation + Routing

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/MobileNav.tsx`

- [ ] **Step 1: Add lazy import and route in App.tsx**

In `src/App.tsx`, add after the `SimTradingPage` lazy import (line 16):

```typescript
const ReviewsPage = lazy(() => import('./pages/ReviewsPage'))
```

Add route after the `/strategy` route (line 68):

```typescript
        <Route path="/reviews" element={<ReviewsPage />} />
```

- [ ] **Step 2: Add to Sidebar**

In `src/components/layout/Sidebar.tsx`, add to the `navItems` array after the `分析策略` item:

```typescript
  { label: '策略檢討', icon: 'assessment', path: '/reviews' },
```

- [ ] **Step 3: Add to MobileNav (optional — only 5 slots on mobile)**

The mobile nav only has 5 items. Since "策略檢討" is a less frequently accessed page, skip adding it to MobileNav. Users access it via the desktop sidebar or the hamburger menu on mobile.

- [ ] **Step 4: Verify build**

Run: `npm run build 2>&1 | tail -5`

Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(nav): add reviews page route and sidebar navigation"
```

---

## Task 8: Build Verification

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit --pretty`

- [ ] **Step 2: Full build**

Run: `npm run build`

- [ ] **Step 3: Verify DB tables**

```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('alert_outcomes', 'strategy_reviews');
```

- [ ] **Step 4: Verify cron schedule**

Read `vercel.json` and confirm both crons are listed.
