# SimTrading Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all data integrity, performance, and security issues in the SimTrading system, add manual controls and audit trail.

**Architecture:** Incremental 3-layer refactor (DB → Backend → Frontend). Each task produces deployable, testable changes. DB RPC functions handle all transactional operations. Backend API route handles all writes. Frontend only reads from Supabase directly.

**Tech Stack:** PostgreSQL (Supabase), Vercel Serverless Functions (TypeScript), React + TanStack Query, Yahoo Finance API

**Spec:** `docs/superpowers/specs/2026-03-25-sim-trading-optimization-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `supabase/migrations/009_sim_tables.sql` | **New** — Indexes, constraints, `sim_trade_log` table, 3 RPC functions, RLS policies |
| `api/_lib/sim-trader.ts` | **Rewrite** — Thin wrappers around DB RPCs, parallel price fetching |
| `api/sim-trading.ts` | **New** — API route for manual close, update TP/SL, create portfolio, read log |
| `api/webhook.ts` | **Edit** — await simAutoBuy instead of fire-and-forget |
| `src/hooks/useSimTrading.ts` | **Rewrite** — Remove direct DB writes, add API-backed mutations with optimistic updates |
| `src/pages/SimTradingPage.tsx` | **Edit** — Manual close buttons, TP/SL editing, trade log tab |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/009_sim_tables.sql`

This migration is safe to run on existing data — uses `IF NOT EXISTS` and `ADD CONSTRAINT` (idempotent).

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/009_sim_tables.sql` with this exact content:

```sql
-- ============================================================
-- 009_sim_tables.sql — Indexes, constraints, audit log, RPCs, RLS
-- Safe for existing sim_portfolio and sim_trades tables
-- ============================================================

-- ─── sim_portfolio: indexes + constraints ────────────────────

CREATE INDEX IF NOT EXISTS idx_sim_portfolio_user_active
  ON sim_portfolio (user_id, is_active)
  WHERE is_active = true;

DO $$ BEGIN
  ALTER TABLE sim_portfolio
    ADD CONSTRAINT chk_cash_balance_non_negative
    CHECK (cash_balance >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE sim_portfolio ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY sim_portfolio_select ON sim_portfolio
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY sim_portfolio_insert ON sim_portfolio
    FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── sim_trades: indexes + RLS ──────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sim_trades_portfolio_status
  ON sim_trades (portfolio_id, status);

CREATE INDEX IF NOT EXISTS idx_sim_trades_status
  ON sim_trades (status)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_sim_trades_ticker_portfolio_open
  ON sim_trades (ticker, portfolio_id)
  WHERE status = 'open';

ALTER TABLE sim_trades ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY sim_trades_select ON sim_trades
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── sim_trade_log: new table ───────────────────────────────

CREATE TABLE IF NOT EXISTS sim_trade_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid REFERENCES sim_trades(id),
  portfolio_id uuid NOT NULL REFERENCES sim_portfolio(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL CHECK (action IN ('BUY', 'SELL_TP', 'SELL_SL', 'SELL_EXPIRED', 'SELL_MANUAL')),
  ticker text NOT NULL,
  price numeric(12,2) NOT NULL,
  quantity numeric(12,4),
  cash_before numeric(12,2) NOT NULL,
  cash_after numeric(12,2) NOT NULL,
  pnl numeric(12,2),
  reasoning text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sim_trade_log_portfolio
  ON sim_trade_log (portfolio_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sim_trade_log_trade
  ON sim_trade_log (trade_id);

CREATE INDEX IF NOT EXISTS idx_sim_trade_log_user
  ON sim_trade_log (user_id, created_at DESC);

ALTER TABLE sim_trade_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY sim_trade_log_select ON sim_trade_log
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── RPC: sim_auto_buy ─────────────────────────────────────

CREATE OR REPLACE FUNCTION sim_auto_buy(
  p_user_id uuid,
  p_alert_id uuid,
  p_ticker text,
  p_entry_price numeric,
  p_confidence integer,
  p_summary text,
  p_stop_loss numeric,
  p_take_profit numeric
) RETURNS jsonb AS $$
DECLARE
  v_portfolio sim_portfolio%ROWTYPE;
  v_existing_count integer;
  v_open_count integer;
  v_alloc_pct numeric;
  v_max_spend numeric;
  v_quantity numeric;
  v_cost numeric;
  v_trade_id uuid;
BEGIN
  SELECT * INTO v_portfolio
  FROM sim_portfolio
  WHERE user_id = p_user_id AND is_active = true
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('bought', false, 'reason', '尚未建立模擬帳戶');
  END IF;

  SELECT COUNT(*) INTO v_existing_count
  FROM sim_trades
  WHERE portfolio_id = v_portfolio.id AND ticker = p_ticker AND status = 'open'
  FOR UPDATE;

  IF v_existing_count > 0 THEN
    RETURN jsonb_build_object('bought', false, 'reason', '已持有 ' || p_ticker || '，不重複買入');
  END IF;

  SELECT COUNT(*) INTO v_open_count
  FROM sim_trades
  WHERE portfolio_id = v_portfolio.id AND status = 'open';

  IF v_open_count >= 10 THEN
    RETURN jsonb_build_object('bought', false, 'reason', '已達持倉上限 10 支');
  END IF;

  v_alloc_pct := CASE
    WHEN p_confidence >= 80 THEN 0.15
    WHEN p_confidence >= 70 THEN 0.12
    ELSE 0.08
  END;
  v_max_spend := v_portfolio.cash_balance * v_alloc_pct;

  IF v_max_spend < p_entry_price THEN
    RETURN jsonb_build_object('bought', false, 'reason',
      '可用資金不足：需 $' || p_entry_price || '，可分配 $' || ROUND(v_max_spend, 2));
  END IF;

  v_quantity := ROUND(FLOOR((v_max_spend / p_entry_price) * 100) / 100, 4);
  v_cost := ROUND(v_quantity * p_entry_price, 2);

  INSERT INTO sim_trades (
    user_id, portfolio_id, alert_id, ticker, action, quantity,
    entry_price, current_price, confidence, ai_reasoning,
    stop_loss, take_profit, status
  ) VALUES (
    p_user_id, v_portfolio.id, p_alert_id, p_ticker, 'BUY', v_quantity,
    p_entry_price, p_entry_price, p_confidence, p_summary,
    p_stop_loss, p_take_profit, 'open'
  ) RETURNING id INTO v_trade_id;

  UPDATE sim_portfolio SET
    cash_balance = ROUND(cash_balance - v_cost, 2),
    total_trades = total_trades + 1,
    updated_at = now()
  WHERE id = v_portfolio.id;

  INSERT INTO sim_trade_log (
    trade_id, portfolio_id, user_id, action, ticker, price, quantity,
    cash_before, cash_after, reasoning
  ) VALUES (
    v_trade_id, v_portfolio.id, p_user_id, 'BUY', p_ticker, p_entry_price, v_quantity,
    v_portfolio.cash_balance, ROUND(v_portfolio.cash_balance - v_cost, 2), p_summary
  );

  RETURN jsonb_build_object(
    'bought', true,
    'reason', '自動買入 ' || p_ticker || ' ' || v_quantity || '股 @ $' || p_entry_price || '（花費 $' || v_cost || '）',
    'trade_id', v_trade_id,
    'quantity', v_quantity,
    'cost', v_cost
  );
END;
$$ LANGUAGE plpgsql;

-- ─── RPC: close_sim_trade ───────────────────────────────────

CREATE OR REPLACE FUNCTION close_sim_trade(
  p_trade_id uuid,
  p_exit_price numeric,
  p_close_reason text -- 'TP', 'SL', 'EXPIRED', 'MANUAL'
) RETURNS jsonb AS $$
DECLARE
  v_trade sim_trades%ROWTYPE;
  v_portfolio sim_portfolio%ROWTYPE;
  v_pnl numeric;
  v_pnl_pct numeric;
  v_cash_back numeric;
  v_is_win boolean;
  v_status text;
  v_new_total_pnl numeric;
  v_new_cash numeric;
  v_holdings_value numeric;
BEGIN
  SELECT * INTO v_trade FROM sim_trades WHERE id = p_trade_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Trade not found or already closed');
  END IF;

  SELECT * INTO v_portfolio FROM sim_portfolio WHERE id = v_trade.portfolio_id FOR UPDATE;

  v_pnl := ROUND((p_exit_price - v_trade.entry_price) * v_trade.quantity, 2);
  v_pnl_pct := ROUND(((p_exit_price - v_trade.entry_price) / v_trade.entry_price) * 100, 2);
  v_cash_back := ROUND(p_exit_price * v_trade.quantity, 2);
  v_is_win := v_pnl > 0;
  v_status := CASE WHEN v_pnl >= 0 THEN 'closed' ELSE 'stopped' END;
  v_new_total_pnl := ROUND(v_portfolio.total_pnl + v_pnl, 2);
  v_new_cash := ROUND(v_portfolio.cash_balance + v_cash_back, 2);

  UPDATE sim_trades SET
    current_price = p_exit_price,
    exit_price = p_exit_price,
    pnl = v_pnl,
    pnl_percent = v_pnl_pct,
    status = v_status,
    closed_at = now(),
    updated_at = now()
  WHERE id = p_trade_id;

  SELECT COALESCE(SUM(current_price * quantity), 0)
  INTO v_holdings_value
  FROM sim_trades
  WHERE portfolio_id = v_trade.portfolio_id AND status = 'open' AND id != p_trade_id;

  -- Only count as win/loss if PnL != 0 (breakeven = neither)
  UPDATE sim_portfolio SET
    cash_balance = v_new_cash,
    total_pnl = v_new_total_pnl,
    total_pnl_percent = ROUND((v_new_total_pnl / NULLIF(initial_capital, 0)) * 100, 2),
    total_value = ROUND(v_new_cash + v_holdings_value, 2),
    winning_trades = winning_trades + (CASE WHEN v_pnl > 0 THEN 1 ELSE 0 END),
    losing_trades = losing_trades + (CASE WHEN v_pnl < 0 THEN 1 ELSE 0 END),
    updated_at = now()
  WHERE id = v_trade.portfolio_id;

  INSERT INTO sim_trade_log (
    trade_id, portfolio_id, user_id, action, ticker, price, quantity,
    cash_before, cash_after, pnl, reasoning
  ) VALUES (
    p_trade_id, v_trade.portfolio_id, v_trade.user_id,
    'SELL_' || p_close_reason,
    v_trade.ticker, p_exit_price, v_trade.quantity,
    v_portfolio.cash_balance, v_new_cash,
    v_pnl, p_close_reason
  );

  RETURN jsonb_build_object(
    'success', true,
    'ticker', v_trade.ticker,
    'pnl', v_pnl,
    'pnl_pct', v_pnl_pct,
    'status', v_status
  );
END;
$$ LANGUAGE plpgsql;

-- ─── RPC: calc_portfolio_value ──────────────────────────────

CREATE OR REPLACE FUNCTION calc_portfolio_value(p_portfolio_id uuid)
RETURNS numeric AS $$
DECLARE
  v_value numeric;
BEGIN
  SELECT ROUND(p.cash_balance + COALESCE(SUM(t.current_price * t.quantity), 0), 2)
  INTO v_value
  FROM sim_portfolio p
  LEFT JOIN sim_trades t ON t.portfolio_id = p.id AND t.status = 'open'
  WHERE p.id = p_portfolio_id
  GROUP BY p.id, p.cash_balance;

  IF v_value IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE sim_portfolio SET total_value = v_value, updated_at = now()
  WHERE id = p_portfolio_id;

  RETURN v_value;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 2: Apply the migration to Supabase**

Run via Supabase MCP tool `apply_migration` with project_id `kkipwwdvctovnkblnodb`, name `009_sim_tables`, and the SQL above.

- [ ] **Step 3: Verify indexes exist**

Run via Supabase MCP tool `execute_sql`:

```sql
SELECT indexname, tablename FROM pg_indexes
WHERE tablename IN ('sim_portfolio', 'sim_trades', 'sim_trade_log')
ORDER BY tablename, indexname;
```

Expected: 7 indexes (1 for sim_portfolio, 3 for sim_trades, 3 for sim_trade_log).

- [ ] **Step 4: Verify RPC functions exist**

```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name IN ('sim_auto_buy', 'close_sim_trade', 'calc_portfolio_value');
```

Expected: 3 rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/009_sim_tables.sql
git commit -m "feat(db): add sim_trade_log table, indexes, RPCs, and RLS for SimTrading"
```

---

## Task 2: Rewrite `sim-trader.ts` (Backend Core)

**Files:**
- Rewrite: `api/_lib/sim-trader.ts`

**Context for engineer:** This file currently has two main exports: `simAutoBuy()` (called from webhook when AI recommends BUY) and `checkSimTrades()` (called from cron job to check TP/SL/expiry). Both have N+1 query problems and no transactions. The rewrite makes `simAutoBuy` a thin wrapper around the `sim_auto_buy` RPC and makes `checkSimTrades` fetch all prices in parallel.

**Key imports already available:**
- `adminClient` from `./supabase.js` — Supabase client with service role key (bypasses RLS)
- `fetchStockData` from `./market-data.js` — Returns `{ info: { price: number, ... }, indicators: {...}, recentCandles: [...] }` or `null`
- `AnalysisResult` from `./types.js` — Has `recommendation`, `confidence`, `entry_price`, `stop_loss`, `take_profit`, `summary`

- [ ] **Step 1: Replace the entire file content**

Write `api/_lib/sim-trader.ts` with:

```typescript
/**
 * AI Auto-Trader: Manages simulated portfolio via DB RPC functions
 * - simAutoBuy: thin wrapper around sim_auto_buy RPC (atomic buy)
 * - checkSimTrades: parallel price fetch + close_sim_trade RPC (atomic sell)
 */

import { adminClient } from './supabase.js'
import { fetchStockData } from './market-data.js'
import type { AnalysisResult } from './types.js'

const MIN_CONFIDENCE_TO_BUY = 65
const MAX_HOLDING_DAYS = 30

/**
 * Called from webhook after AI analysis.
 * Delegates entirely to the sim_auto_buy RPC for atomicity.
 */
export async function simAutoBuy(
  userId: string,
  alertId: string,
  ticker: string,
  analysis: AnalysisResult,
): Promise<{ bought: boolean; reason: string }> {
  if (analysis.recommendation !== 'BUY') {
    return { bought: false, reason: `不符合買入條件：建議為 ${analysis.recommendation}` }
  }
  if (analysis.confidence < MIN_CONFIDENCE_TO_BUY) {
    return { bought: false, reason: `信心度不足：${analysis.confidence}% < ${MIN_CONFIDENCE_TO_BUY}%` }
  }

  const entryPrice = analysis.entry_price
  if (!entryPrice || entryPrice <= 0) {
    return { bought: false, reason: '無有效進場價格' }
  }

  const { data, error } = await adminClient.rpc('sim_auto_buy', {
    p_user_id: userId,
    p_alert_id: alertId,
    p_ticker: ticker,
    p_entry_price: entryPrice,
    p_confidence: analysis.confidence,
    p_summary: analysis.summary || '',
    p_stop_loss: analysis.stop_loss ?? null,
    p_take_profit: analysis.take_profit ?? null,
  })

  if (error) {
    console.error('[SIM] sim_auto_buy RPC error:', error.message)
    return { bought: false, reason: `資料庫錯誤：${error.message}` }
  }

  const result = data as { bought: boolean; reason: string }
  console.log(`[SIM] ${ticker}: ${result.reason}`)
  return result
}

/**
 * Called from cron job.
 * 1. Fetch all open trades
 * 2. Parallel-fetch prices for unique tickers
 * 3. Check TP/SL/expiry → close via RPC
 * 4. Update prices for remaining open trades
 * 5. Recalculate portfolio values
 */
export async function checkSimTrades(): Promise<{
  checked: number
  sold: Array<{ ticker: string; pnlPct: number; reason: string }>
  updated: number
}> {
  // 1. Fetch all open trades
  const { data: openTrades } = await adminClient
    .from('sim_trades')
    .select('id, portfolio_id, user_id, ticker, entry_price, stop_loss, take_profit, quantity, created_at')
    .eq('status', 'open')

  if (!openTrades || openTrades.length === 0) {
    return { checked: 0, sold: [], updated: 0 }
  }

  // 2. Collect unique tickers and fetch prices in parallel
  const uniqueTickers = [...new Set(openTrades.map(t => t.ticker))]
  const priceResults = await Promise.all(
    uniqueTickers.map(async ticker => {
      const data = await fetchStockData(ticker)
      return { ticker, price: data?.info.price ?? null }
    })
  )
  const priceMap = new Map(priceResults.map(r => [r.ticker, r.price]))

  // 3. Process each trade
  const sold: Array<{ ticker: string; pnlPct: number; reason: string }> = []
  const priceUpdates: Array<{ id: string; price: number; pnl: number; pnlPct: number }> = []

  for (const trade of openTrades) {
    const currentPrice = priceMap.get(trade.ticker)
    if (currentPrice == null) continue

    const entryPrice = Number(trade.entry_price)
    const sl = trade.stop_loss ? Number(trade.stop_loss) : null
    const tp = trade.take_profit ? Number(trade.take_profit) : null
    const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100
    const pnlAmount = (currentPrice - entryPrice) * Number(trade.quantity)

    let shouldSell = false
    let closeReason = ''
    let reasonText = ''

    if (tp && currentPrice >= tp) {
      shouldSell = true
      closeReason = 'TP'
      reasonText = `到達目標價 $${tp}（現價 $${currentPrice}）`
    } else if (sl && currentPrice <= sl) {
      shouldSell = true
      closeReason = 'SL'
      reasonText = `觸發止損 $${sl}（現價 $${currentPrice}）`
    } else {
      const daysHeld = (Date.now() - new Date(trade.created_at).getTime()) / (1000 * 60 * 60 * 24)
      if (daysHeld >= MAX_HOLDING_DAYS) {
        shouldSell = true
        closeReason = 'EXPIRED'
        reasonText = `持倉超過 ${MAX_HOLDING_DAYS} 天，自動平倉（現價 $${currentPrice}）`
      }
    }

    if (shouldSell) {
      // Close via atomic RPC
      const { data: result, error } = await adminClient.rpc('close_sim_trade', {
        p_trade_id: trade.id,
        p_exit_price: currentPrice,
        p_close_reason: closeReason,
      })

      if (error) {
        console.error(`[SIM] close_sim_trade error for ${trade.ticker}:`, error.message)
        continue
      }

      if (result?.error) {
        console.error(`[SIM] close_sim_trade rejected for ${trade.ticker}:`, result.error)
        continue
      }

      sold.push({
        ticker: trade.ticker,
        pnlPct: Math.round(pnlPct * 100) / 100,
        reason: reasonText,
      })
      console.log(`[SIM] Auto-sold ${trade.ticker}: ${reasonText} (PnL: ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`)
    } else {
      priceUpdates.push({
        id: trade.id,
        price: currentPrice,
        pnl: Math.round(pnlAmount * 100) / 100,
        pnlPct: Math.round(pnlPct * 100) / 100,
      })
    }
  }

  // 4. Batch update prices for non-sold trades
  for (const { id, price, pnl, pnlPct } of priceUpdates) {
    await adminClient.from('sim_trades').update({
      current_price: price,
      pnl,
      pnl_percent: pnlPct,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
  }

  // 5. Recalculate portfolio values
  const portfolioIds = [...new Set(openTrades.map(t => t.portfolio_id))]
  for (const pid of portfolioIds) {
    await adminClient.rpc('calc_portfolio_value', { p_portfolio_id: pid })
  }

  return { checked: openTrades.length, sold, updated: priceUpdates.length }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add api/_lib/sim-trader.ts
git commit -m "feat(api): rewrite sim-trader with RPC calls and parallel price fetching"
```

---

## Task 3: Fix Webhook (await simAutoBuy)

**Files:**
- Modify: `api/webhook.ts:104-107`

- [ ] **Step 1: Replace the fire-and-forget block**

In `api/webhook.ts`, find lines 104-107:

```typescript
      // AI Sim Auto-Buy (fire-and-forget, never block webhook)
      simAutoBuy(userId, alertRecord.id, ticker, analysis)
        .then(r => console.log(`[SIM] ${ticker}: ${r.reason}`))
        .catch(e => console.error(`[SIM] ${ticker} error:`, e.message))
```

Replace with:

```typescript
      // AI Sim Auto-Buy (awaited to prevent silent failures)
      try {
        const simResult = await simAutoBuy(userId, alertRecord.id, ticker, analysis)
        console.log(`[SIM] ${ticker}: ${simResult.reason}`)
      } catch (e: any) {
        console.error(`[SIM] ${ticker} error:`, e.message)
      }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add api/webhook.ts
git commit -m "fix(api): await simAutoBuy in webhook to prevent silent failures"
```

---

## Task 4: New API Route (`/api/sim-trading.ts`)

**Files:**
- Create: `api/sim-trading.ts`

**Context:** This project uses Vercel serverless functions. Each file in `api/` becomes an endpoint. Auth helper `createUserClient(req)` in `api/_lib/supabase.ts` creates a Supabase client scoped to the JWT in the `Authorization` header. `adminClient` bypasses RLS. `withErrorHandler` in `api/_lib/errors.ts` wraps handlers with try/catch. `fetchStockData(ticker)` in `api/_lib/market-data.ts` returns stock data or null.

- [ ] **Step 1: Create the API route**

Write `api/sim-trading.ts`:

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withErrorHandler } from './_lib/errors.js'
import { HttpError } from './_lib/errors.js'
import { adminClient, createUserClient } from './_lib/supabase.js'
import { fetchStockData } from './_lib/market-data.js'

async function getUserId(req: VercelRequest): Promise<string> {
  const client = createUserClient(req) // throws 401 if no token
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) throw new HttpError(401, 'Invalid token', 'UNAUTHORIZED')
  return user.id
}

export default withErrorHandler(async (req: VercelRequest, res: VercelResponse) => {
  const action = req.query.action as string
  if (!action) {
    return res.status(400).json({ error: 'Missing action parameter', code: 'MISSING_ACTION' })
  }

  const userId = await getUserId(req)

  // ─── POST actions ─────────────────────────────────────────
  if (req.method === 'POST') {
    if (action === 'create') {
      const { capital } = req.body || {}
      if (typeof capital !== 'number' || capital < 1000) {
        throw new HttpError(400, '最低本金 $1,000', 'INVALID_CAPITAL')
      }

      const { data, error } = await adminClient
        .from('sim_portfolio')
        .insert({
          user_id: userId,
          initial_capital: capital,
          cash_balance: capital,
          total_value: capital,
        })
        .select()
        .single()

      if (error) throw new HttpError(500, error.message, 'DB_ERROR')
      return res.status(201).json(data)
    }

    if (action === 'close') {
      const { tradeId } = req.body || {}
      if (!tradeId) throw new HttpError(400, 'Missing tradeId', 'MISSING_TRADE_ID')

      // Verify ownership
      const { data: trade } = await adminClient
        .from('sim_trades')
        .select('id, ticker, user_id, status')
        .eq('id', tradeId)
        .single()

      if (!trade) throw new HttpError(404, 'Trade not found', 'NOT_FOUND')
      if (trade.user_id !== userId) throw new HttpError(403, 'Not your trade', 'FORBIDDEN')
      if (trade.status !== 'open') throw new HttpError(400, 'Trade already closed', 'ALREADY_CLOSED')

      // Get current price
      const stockData = await fetchStockData(trade.ticker)
      const exitPrice = stockData?.info.price
      if (!exitPrice) throw new HttpError(502, `無法取得 ${trade.ticker} 的即時價格`, 'PRICE_UNAVAILABLE')

      // Close via atomic RPC
      const { data: result, error } = await adminClient.rpc('close_sim_trade', {
        p_trade_id: tradeId,
        p_exit_price: exitPrice,
        p_close_reason: 'MANUAL',
      })

      if (error) throw new HttpError(500, error.message, 'RPC_ERROR')
      if (result?.error) throw new HttpError(400, result.error, 'CLOSE_FAILED')

      return res.status(200).json(result)
    }

    if (action === 'update-tp-sl') {
      const { tradeId, stopLoss, takeProfit } = req.body || {}
      if (!tradeId) throw new HttpError(400, 'Missing tradeId', 'MISSING_TRADE_ID')

      // Verify ownership and get current trade
      const { data: trade } = await adminClient
        .from('sim_trades')
        .select('id, user_id, status, entry_price')
        .eq('id', tradeId)
        .single()

      if (!trade) throw new HttpError(404, 'Trade not found', 'NOT_FOUND')
      if (trade.user_id !== userId) throw new HttpError(403, 'Not your trade', 'FORBIDDEN')
      if (trade.status !== 'open') throw new HttpError(400, 'Trade already closed', 'ALREADY_CLOSED')

      const entryPrice = Number(trade.entry_price)

      // Validate
      if (stopLoss != null) {
        if (stopLoss <= 0) throw new HttpError(400, '止損價必須大於 0', 'INVALID_SL')
        if (stopLoss >= entryPrice) throw new HttpError(400, '止損價必須低於進場價', 'INVALID_SL')
      }
      if (takeProfit != null) {
        if (takeProfit <= 0) throw new HttpError(400, '目標價必須大於 0', 'INVALID_TP')
        if (takeProfit <= entryPrice) throw new HttpError(400, '目標價必須高於進場價', 'INVALID_TP')
      }
      if (stopLoss != null && takeProfit != null && stopLoss >= takeProfit) {
        throw new HttpError(400, '止損價必須低於目標價', 'INVALID_TP_SL')
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (stopLoss !== undefined) updates.stop_loss = stopLoss
      if (takeProfit !== undefined) updates.take_profit = takeProfit

      const { error } = await adminClient
        .from('sim_trades')
        .update(updates)
        .eq('id', tradeId)

      if (error) throw new HttpError(500, error.message, 'DB_ERROR')
      return res.status(200).json({ success: true })
    }

    return res.status(400).json({ error: `Unknown POST action: ${action}`, code: 'UNKNOWN_ACTION' })
  }

  // ─── GET actions ──────────────────────────────────────────
  if (req.method === 'GET') {
    if (action === 'portfolio') {
      const { data } = await adminClient
        .from('sim_portfolio')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      return res.status(200).json(data)
    }

    if (action === 'trades') {
      const portfolioId = req.query.portfolioId as string
      const status = req.query.status as string
      if (!portfolioId) throw new HttpError(400, 'Missing portfolioId', 'MISSING_PORTFOLIO_ID')

      let query = adminClient
        .from('sim_trades')
        .select('*')
        .eq('portfolio_id', portfolioId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (status) query = query.eq('status', status)

      const { data, error } = await query
      if (error) throw new HttpError(500, error.message, 'DB_ERROR')
      return res.status(200).json(data)
    }

    if (action === 'log') {
      const portfolioId = req.query.portfolioId as string
      const limit = parseInt(req.query.limit as string) || 50
      if (!portfolioId) throw new HttpError(400, 'Missing portfolioId', 'MISSING_PORTFOLIO_ID')

      const { data, error } = await adminClient
        .from('sim_trade_log')
        .select('*')
        .eq('portfolio_id', portfolioId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(Math.min(limit, 100))

      if (error) throw new HttpError(500, error.message, 'DB_ERROR')
      return res.status(200).json(data)
    }

    return res.status(400).json({ error: `Unknown GET action: ${action}`, code: 'UNKNOWN_ACTION' })
  }

  return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
})
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add api/sim-trading.ts
git commit -m "feat(api): add sim-trading API route with close, update-tp-sl, and log endpoints"
```

---

## Task 5: Rewrite Frontend Hooks

**Files:**
- Rewrite: `src/hooks/useSimTrading.ts`

**Context:** This file currently exports `useSimPortfolio`, `useSimTrades`, `useCreatePortfolio`, `useSimBuy`, `useSimSell`. The last two directly write to Supabase. We remove them and add API-backed mutations instead. `supabase` client is imported from `../lib/supabase` for reads. For writes, we call `/api/sim-trading` endpoints.

- [ ] **Step 1: Replace the entire file**

Write `src/hooks/useSimTrading.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface SimPortfolio {
  id: string
  user_id: string
  name: string
  initial_capital: number
  cash_balance: number
  total_value: number
  total_pnl: number
  total_pnl_percent: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SimTrade {
  id: string
  user_id: string
  portfolio_id: string
  alert_id: string | null
  ticker: string
  action: 'BUY' | 'SELL'
  quantity: number
  entry_price: number
  current_price: number | null
  exit_price: number | null
  pnl: number
  pnl_percent: number
  confidence: number
  ai_reasoning: string | null
  status: 'open' | 'closed' | 'stopped'
  stop_loss: number | null
  take_profit: number | null
  created_at: string
  closed_at: string | null
  updated_at: string
}

export interface SimTradeLog {
  id: string
  trade_id: string | null
  portfolio_id: string
  user_id: string
  action: string
  ticker: string
  price: number
  quantity: number | null
  cash_before: number
  cash_after: number
  pnl: number | null
  reasoning: string | null
  created_at: string
}

// ─── Helper: authenticated fetch ────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated')

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || `API error ${res.status}`)
  }

  return res.json()
}

// ─── Read hooks (Supabase direct — fine with RLS) ───────────

export function useSimPortfolio() {
  return useQuery({
    queryKey: ['sim_portfolio'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sim_portfolio')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as SimPortfolio | null
    },
  })
}

export function useSimTrades(portfolioId?: string, status?: string) {
  return useQuery({
    queryKey: ['sim_trades', portfolioId, status],
    refetchInterval: 30_000,
    enabled: !!portfolioId,
    queryFn: async () => {
      let query = supabase
        .from('sim_trades')
        .select('*')
        .eq('portfolio_id', portfolioId!)
        .order('created_at', { ascending: false })

      if (status) query = query.eq('status', status)

      const { data, error } = await query
      if (error) throw error
      return data as SimTrade[]
    },
  })
}

export function useTradeLog(portfolioId?: string) {
  return useQuery({
    queryKey: ['sim_trade_log', portfolioId],
    enabled: !!portfolioId,
    queryFn: async () => {
      return apiFetch<SimTradeLog[]>(`/api/sim-trading?action=log&portfolioId=${portfolioId}&limit=50`)
    },
  })
}

// ─── Write hooks (API-backed) ───────────────────────────────

export function useCreatePortfolio() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (capital: number) => {
      return apiFetch<SimPortfolio>('/api/sim-trading?action=create', {
        method: 'POST',
        body: JSON.stringify({ capital }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sim_portfolio'] })
    },
  })
}

export function useManualClose(portfolioId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (tradeId: string) => {
      return apiFetch<{ success: boolean; pnl: number; pnl_pct: number }>('/api/sim-trading?action=close', {
        method: 'POST',
        body: JSON.stringify({ tradeId }),
      })
    },
    onMutate: async (tradeId) => {
      await queryClient.cancelQueries({ queryKey: ['sim_trades', portfolioId, 'open'] })
      const prev = queryClient.getQueryData<SimTrade[]>(['sim_trades', portfolioId, 'open'])
      queryClient.setQueryData<SimTrade[]>(['sim_trades', portfolioId, 'open'], old =>
        old?.filter(t => t.id !== tradeId) ?? []
      )
      return { prev }
    },
    onError: (_err, _tradeId, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['sim_trades', portfolioId, 'open'], context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['sim_portfolio'] })
      queryClient.invalidateQueries({ queryKey: ['sim_trades'] })
      queryClient.invalidateQueries({ queryKey: ['sim_trade_log'] })
    },
  })
}

export function useUpdateTpSl(portfolioId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { tradeId: string; stopLoss?: number | null; takeProfit?: number | null }) => {
      return apiFetch<{ success: boolean }>('/api/sim-trading?action=update-tp-sl', {
        method: 'POST',
        body: JSON.stringify(params),
      })
    },
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: ['sim_trades', portfolioId, 'open'] })
      const prev = queryClient.getQueryData<SimTrade[]>(['sim_trades', portfolioId, 'open'])
      queryClient.setQueryData<SimTrade[]>(['sim_trades', portfolioId, 'open'], old =>
        old?.map(t => {
          if (t.id !== params.tradeId) return t
          return {
            ...t,
            stop_loss: params.stopLoss !== undefined ? (params.stopLoss ?? t.stop_loss) : t.stop_loss,
            take_profit: params.takeProfit !== undefined ? (params.takeProfit ?? t.take_profit) : t.take_profit,
          }
        }) ?? []
      )
      return { prev }
    },
    onError: (_err, _params, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['sim_trades', portfolioId, 'open'], context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['sim_trades'] })
    },
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSimTrading.ts
git commit -m "feat(hooks): rewrite useSimTrading with API-backed mutations and optimistic updates"
```

---

## Task 6: Update SimTradingPage UI

**Files:**
- Modify: `src/pages/SimTradingPage.tsx`

**Context:** The page currently imports `useSimPortfolio`, `useSimTrades`, `useCreatePortfolio` from hooks. We need to also import `useManualClose`, `useUpdateTpSl`, `useTradeLog`, `SimTradeLog`. Add manual close button to HoldingCard, editable TP/SL, and a new "交易日誌" tab.

- [ ] **Step 1: Update imports**

At the top of `SimTradingPage.tsx`, change the import:

```typescript
import {
  useSimPortfolio,
  useSimTrades,
  useCreatePortfolio,
  useManualClose,
  useUpdateTpSl,
  useTradeLog,
} from '../hooks/useSimTrading'
import { formatPrice, formatPercent } from '../lib/utils'
import type { SimTrade, SimTradeLog } from '../hooks/useSimTrading'
```

- [ ] **Step 2: Add manual close button to HoldingCard**

In the `HoldingCard` component, add a `portfolioId` prop and close button. Change the component signature to:

```typescript
function HoldingCard({ trade, portfolioId }: { trade: SimTrade; portfolioId: string }) {
```

Add `useManualClose` inside the component:

```typescript
  const manualClose = useManualClose(portfolioId)
  const [showConfirm, setShowConfirm] = useState(false)
```

Add after the TP/SL progress section (before the `ai_reasoning` section):

```typescript
      {/* Manual close */}
      <div className="mt-3 pt-2 border-t border-border">
        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            className="w-full py-2 rounded-lg border border-tertiary/30 text-tertiary text-xs font-medium hover:bg-tertiary-light transition-colors"
          >
            手動平倉
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => {
                manualClose.mutate(trade.id)
                setShowConfirm(false)
              }}
              disabled={manualClose.isPending}
              className="flex-1 py-2 rounded-lg bg-tertiary text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              {manualClose.isPending ? '平倉中...' : '確認平倉'}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="flex-1 py-2 rounded-lg border border-border text-on-surface-variant text-xs font-medium hover:bg-surface"
            >
              取消
            </button>
          </div>
        )}
      </div>
```

Add `useState` to the HoldingCard component's imports (already imported at file top).

- [ ] **Step 3: Add TP/SL inline editing to HoldingCard**

Add `useUpdateTpSl` to HoldingCard:

```typescript
  const updateTpSl = useUpdateTpSl(portfolioId)
  const [editingTpSl, setEditingTpSl] = useState(false)
  const [editSl, setEditSl] = useState(trade.stop_loss ?? 0)
  const [editTp, setEditTp] = useState(trade.take_profit ?? 0)
```

Replace the existing TP/SL progress section (the block with `{(trade.stop_loss || trade.take_profit) && (` ...) with:

```typescript
      {/* TP/SL section */}
      {(trade.stop_loss || trade.take_profit) && (
        <div className="mt-3 pt-2 border-t border-border">
          {!editingTpSl ? (
            <>
              <div className="flex justify-between text-[10px] text-on-surface-variant mb-1">
                <span>止損 {trade.stop_loss ? formatPrice(trade.stop_loss) : '—'}</span>
                <button
                  onClick={() => { setEditSl(trade.stop_loss ?? 0); setEditTp(trade.take_profit ?? 0); setEditingTpSl(true) }}
                  className="text-secondary hover:underline"
                >
                  修改
                </button>
                <span>目標 {trade.take_profit ? formatPrice(trade.take_profit) : '—'}</span>
              </div>
              {trade.stop_loss && trade.take_profit && (
                <div className="h-2 rounded-full bg-surface overflow-hidden relative">
                  <div
                    className={`h-full rounded-full ${isProfit ? 'bg-primary' : 'bg-tertiary'} transition-all`}
                    style={{
                      width: `${Math.min(100, Math.max(0, ((currentPrice - trade.stop_loss) / (trade.take_profit - trade.stop_loss)) * 100))}%`
                    }}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-on-surface-variant">止損</label>
                  <input type="number" step="0.01" value={editSl || ''} onChange={e => setEditSl(Number(e.target.value))}
                    className="w-full px-2 py-1 rounded border border-border text-xs mono-data outline-none focus:border-primary" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-on-surface-variant">目標</label>
                  <input type="number" step="0.01" value={editTp || ''} onChange={e => setEditTp(Number(e.target.value))}
                    className="w-full px-2 py-1 rounded border border-border text-xs mono-data outline-none focus:border-primary" />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { updateTpSl.mutate({ tradeId: trade.id, stopLoss: editSl || null, takeProfit: editTp || null }); setEditingTpSl(false) }}
                  className="flex-1 py-1.5 rounded bg-primary text-white text-xs font-medium hover:opacity-90"
                >
                  儲存
                </button>
                <button onClick={() => setEditingTpSl(false)}
                  className="flex-1 py-1.5 rounded border border-border text-on-surface-variant text-xs hover:bg-surface"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 4: Update HoldingCard usage in the grid**

Find where `<HoldingCard>` is rendered and add `portfolioId`:

```typescript
<HoldingCard key={trade.id} trade={trade} portfolioId={portfolio.id} />
```

- [ ] **Step 5: Add trade log tab**

In the main `SimTradingPage` component, add the trade log hook:

```typescript
  const { data: tradeLog = [] } = useTradeLog(portfolio?.id)
```

Add `'log'` to the tab type and add the 4th tab button:

```typescript
  const [tab, setTab] = useState<'holdings' | 'history' | 'rules' | 'log'>('holdings')
```

In the tabs array, add:

```typescript
  { key: 'log' as const, label: '交易日誌', count: tradeLog.length },
```

Add the log tab content after the rules tab section:

```typescript
      {/* Log Tab */}
      {tab === 'log' && (
        <>
          {tradeLog.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3 text-center">
              <span className="material-symbols-outlined text-border" style={{ fontSize: 56 }}>receipt_long</span>
              <h3 className="serif-heading text-xl text-on-surface">尚無交易日誌</h3>
              <p className="text-sm text-on-surface-variant">AI 執行買賣操作後，所有紀錄會自動出現在這裡</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-border editorial-shadow overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="bg-surface border-b border-border">
                    <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">時間</th>
                    <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">操作</th>
                    <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">股票</th>
                    <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">價格</th>
                    <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">數量</th>
                    <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">損益</th>
                    <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">現金變化</th>
                  </tr>
                </thead>
                <tbody>
                  {tradeLog.map((log: SimTradeLog) => (
                    <tr key={log.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 mono-data text-xs text-on-surface-variant">
                        {new Date(log.created_at).toLocaleString('zh-TW')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${logActionBadge(log.action)}`}>
                          {logActionLabel(log.action)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-on-surface">{log.ticker}</td>
                      <td className="px-4 py-3 mono-data text-xs text-on-surface-variant text-right">{formatPrice(log.price)}</td>
                      <td className="px-4 py-3 mono-data text-xs text-on-surface-variant text-right">{log.quantity ?? '—'}</td>
                      <td className={`px-4 py-3 mono-data text-xs font-semibold text-right ${
                        log.pnl != null ? (log.pnl > 0 ? 'text-primary-dark' : 'text-tertiary') : 'text-on-surface-variant'
                      }`}>
                        {log.pnl != null ? (log.pnl > 0 ? '+' : '') + formatPrice(log.pnl) : '—'}
                      </td>
                      <td className="px-4 py-3 mono-data text-xs text-on-surface-variant text-right">
                        {formatPrice(log.cash_before)} → {formatPrice(log.cash_after)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
```

- [ ] **Step 6: Add log action helpers**

Add these helpers near the top of the file (after existing helpers):

```typescript
function logActionBadge(action: string): string {
  switch (action) {
    case 'BUY': return 'bg-primary-light text-primary-dark border border-primary/20'
    case 'SELL_TP': return 'bg-primary-light text-primary-dark border border-primary/20'
    case 'SELL_SL': return 'bg-tertiary-light text-tertiary-dark border border-tertiary/20'
    case 'SELL_MANUAL': return 'bg-warning-light text-warning-dark border border-warning/20'
    case 'SELL_EXPIRED': return 'bg-neutral/10 text-on-surface-variant border border-border'
    default: return 'bg-surface text-on-surface-variant border border-border'
  }
}

function logActionLabel(action: string): string {
  switch (action) {
    case 'BUY': return '買入'
    case 'SELL_TP': return '止盈'
    case 'SELL_SL': return '止損'
    case 'SELL_MANUAL': return '手動平倉'
    case 'SELL_EXPIRED': return '到期平倉'
    default: return action
  }
}
```

- [ ] **Step 7: Verify TypeScript compiles and build succeeds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Then: `npm run build 2>&1 | tail -5`

Expected: No errors, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/pages/SimTradingPage.tsx
git commit -m "feat(ui): add manual close, TP/SL editing, trade log tab to SimTradingPage"
```

---

## Task 7: Build Verification

- [ ] **Step 1: Full build**

Run: `npm run build`

Expected: Clean build, no errors.

- [ ] **Step 2: Verify DB RPCs via Supabase**

Run SQL via Supabase MCP `execute_sql`:

```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('sim_auto_buy', 'close_sim_trade', 'calc_portfolio_value');
```

Expected: 3 rows.

- [ ] **Step 3: Verify indexes**

```sql
SELECT indexname, tablename FROM pg_indexes
WHERE tablename IN ('sim_portfolio', 'sim_trades', 'sim_trade_log')
ORDER BY tablename, indexname;
```

Expected: 7 custom indexes.

- [ ] **Step 4: Commit any final fixes**

If any adjustments were needed, commit them.
