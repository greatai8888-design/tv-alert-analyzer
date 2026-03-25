# SimTrading System Optimization — Design Spec

**Date:** 2026-03-25
**Scope:** Full refactor of the SimTrading subsystem (DB, backend, frontend)
**Approach:** Incremental — each layer can be deployed and verified independently

---

## 1. Problem Statement

The current SimTrading system has several critical issues:

1. **Data integrity** — No DB transactions for multi-step operations (close trade + update portfolio). Partial failures leave inconsistent state.
2. **Performance** — `checkSimTrades()` fetches stock prices sequentially (N+1). 10 open trades = 10 serial Yahoo Finance calls.
3. **Silent failures** — Webhook uses fire-and-forget for `simAutoBuy()`. Vercel may terminate the function before the DB write completes.
4. **Missing indexes** — `sim_portfolio` and `sim_trades` tables have no migration file and likely no indexes. Every query scans the full table.
5. **Security** — Frontend hooks (`useSimBuy`, `useSimSell`) directly insert/update `sim_trades` via Supabase client, bypassing server-side validation.
6. **No audit trail** — Cannot see when AI decided to buy, at what price, or why. Cash balance drift is undetectable.
7. **No manual control** — Users cannot manually close positions, modify TP/SL, or pause AI trading.
8. **Floating-point drift** — All money calculations use JS `number`. Rounding errors accumulate over time.

---

## 2. Database Layer

### 2.1 New Migration: `009_sim_tables.sql`

Creates tables if they don't exist (safe for existing data), adds indexes and constraints.

#### `sim_portfolio` — indexes, constraints, RLS

```sql
-- Indexes
CREATE INDEX IF NOT EXISTS idx_sim_portfolio_user_active
  ON sim_portfolio (user_id, is_active)
  WHERE is_active = true;

-- Constraints
ALTER TABLE sim_portfolio
  ADD CONSTRAINT chk_cash_balance_non_negative
  CHECK (cash_balance >= 0);

-- RLS
ALTER TABLE sim_portfolio ENABLE ROW LEVEL SECURITY;

CREATE POLICY sim_portfolio_select ON sim_portfolio
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY sim_portfolio_insert ON sim_portfolio
  FOR INSERT WITH CHECK (user_id = auth.uid());
```

#### `sim_trades` — indexes, RLS

```sql
CREATE INDEX IF NOT EXISTS idx_sim_trades_portfolio_status
  ON sim_trades (portfolio_id, status);

CREATE INDEX IF NOT EXISTS idx_sim_trades_status
  ON sim_trades (status)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_sim_trades_ticker_portfolio_open
  ON sim_trades (ticker, portfolio_id)
  WHERE status = 'open';

-- RLS
ALTER TABLE sim_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY sim_trades_select ON sim_trades
  FOR SELECT USING (user_id = auth.uid());
```

#### New table: `sim_trade_log`

Immutable audit log for all portfolio operations.

```sql
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

-- RLS (fast path via denormalized user_id)
ALTER TABLE sim_trade_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY sim_trade_log_select ON sim_trade_log
  FOR SELECT USING (user_id = auth.uid());
```

#### RPC: `sim_auto_buy`

Atomic transaction for the buy side — prevents race conditions (concurrent webhooks for same ticker).

```sql
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
  -- Lock the active portfolio
  SELECT * INTO v_portfolio
  FROM sim_portfolio
  WHERE user_id = p_user_id AND is_active = true
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('bought', false, 'reason', '尚未建立模擬帳戶');
  END IF;

  -- Check duplicate holding (with lock)
  SELECT COUNT(*) INTO v_existing_count
  FROM sim_trades
  WHERE portfolio_id = v_portfolio.id AND ticker = p_ticker AND status = 'open'
  FOR UPDATE;

  IF v_existing_count > 0 THEN
    RETURN jsonb_build_object('bought', false, 'reason', '已持有 ' || p_ticker || '，不重複買入');
  END IF;

  -- Check max positions
  SELECT COUNT(*) INTO v_open_count
  FROM sim_trades
  WHERE portfolio_id = v_portfolio.id AND status = 'open';

  IF v_open_count >= 10 THEN
    RETURN jsonb_build_object('bought', false, 'reason', '已達持倉上限 10 支');
  END IF;

  -- Calculate position size
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

  -- Insert trade
  INSERT INTO sim_trades (
    user_id, portfolio_id, alert_id, ticker, action, quantity,
    entry_price, current_price, confidence, ai_reasoning,
    stop_loss, take_profit, status
  ) VALUES (
    p_user_id, v_portfolio.id, p_alert_id, p_ticker, 'BUY', v_quantity,
    p_entry_price, p_entry_price, p_confidence, p_summary,
    p_stop_loss, p_take_profit, 'open'
  ) RETURNING id INTO v_trade_id;

  -- Update portfolio cash
  UPDATE sim_portfolio SET
    cash_balance = ROUND(cash_balance - v_cost, 2),
    total_trades = total_trades + 1,
    updated_at = now()
  WHERE id = v_portfolio.id;

  -- Write audit log
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
```

#### RPC: `close_sim_trade`

Atomic transaction that closes a trade and updates the portfolio in one operation.

```sql
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
  -- Lock the trade row
  SELECT * INTO v_trade FROM sim_trades WHERE id = p_trade_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Trade not found or already closed');
  END IF;

  -- Lock the portfolio row
  SELECT * INTO v_portfolio FROM sim_portfolio WHERE id = v_trade.portfolio_id FOR UPDATE;

  -- Calculate PnL
  v_pnl := ROUND((p_exit_price - v_trade.entry_price) * v_trade.quantity, 2);
  v_pnl_pct := ROUND(((p_exit_price - v_trade.entry_price) / v_trade.entry_price) * 100, 2);
  v_cash_back := ROUND(p_exit_price * v_trade.quantity, 2);
  v_is_win := v_pnl > 0;
  v_status := CASE WHEN v_is_win THEN 'closed' ELSE 'stopped' END;
  v_new_total_pnl := ROUND(v_portfolio.total_pnl + v_pnl, 2);
  v_new_cash := ROUND(v_portfolio.cash_balance + v_cash_back, 2);

  -- Update trade
  UPDATE sim_trades SET
    current_price = p_exit_price,
    exit_price = p_exit_price,
    pnl = v_pnl,
    pnl_percent = v_pnl_pct,
    status = v_status,
    closed_at = now(),
    updated_at = now()
  WHERE id = p_trade_id;

  -- Calculate remaining holdings value (excluding the just-closed trade)
  SELECT COALESCE(SUM(current_price * quantity), 0)
  INTO v_holdings_value
  FROM sim_trades
  WHERE portfolio_id = v_trade.portfolio_id AND status = 'open' AND id != p_trade_id;

  -- Update portfolio in a single UPDATE
  UPDATE sim_portfolio SET
    cash_balance = v_new_cash,
    total_pnl = v_new_total_pnl,
    total_pnl_percent = ROUND((v_new_total_pnl / initial_capital) * 100, 2),
    total_value = ROUND(v_new_cash + v_holdings_value, 2),
    winning_trades = winning_trades + (CASE WHEN v_is_win THEN 1 ELSE 0 END),
    losing_trades = losing_trades + (CASE WHEN v_is_win THEN 0 ELSE 1 END),
    updated_at = now()
  WHERE id = v_trade.portfolio_id;

  -- Write audit log
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
```

#### RPC: `calc_portfolio_value`

Single SQL call to recalculate portfolio total_value.

```sql
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

---

## 3. Backend Layer

### 3.1 `sim-trader.ts` — Refactored Functions

#### `simAutoBuy()` rewrite:
- Called with `await` in webhook (no more fire-and-forget)
- Calls DB RPC `sim_auto_buy` instead of doing multi-step JS operations
- The RPC handles duplicate checking, position limits, cash deduction, and audit log atomically
- Simplified to a thin wrapper around the RPC call

```typescript
export async function simAutoBuy(
  userId: string, alertId: string, ticker: string, analysis: AnalysisResult
): Promise<{ bought: boolean; reason: string }> {
  if (analysis.recommendation !== 'BUY') {
    return { bought: false, reason: `不符合買入條件：建議為 ${analysis.recommendation}` }
  }
  if (analysis.confidence < MIN_CONFIDENCE_TO_BUY) {
    return { bought: false, reason: `信心度不足：${analysis.confidence}% < ${MIN_CONFIDENCE_TO_BUY}%` }
  }
  if (!analysis.entry_price || analysis.entry_price <= 0) {
    return { bought: false, reason: '無有效進場價格' }
  }

  const { data, error } = await adminClient.rpc('sim_auto_buy', {
    p_user_id: userId,
    p_alert_id: alertId,
    p_ticker: ticker,
    p_entry_price: analysis.entry_price,
    p_confidence: analysis.confidence,
    p_summary: analysis.summary,
    p_stop_loss: analysis.stop_loss ?? null,
    p_take_profit: analysis.take_profit ?? null,
  })

  if (error) {
    console.error('[SIM] RPC error:', error.message)
    return { bought: false, reason: `資料庫錯誤：${error.message}` }
  }

  return { bought: data.bought, reason: data.reason }
}
```

#### `checkSimTrades()` rewrite:

```
1. Fetch all open trades (single query)
2. Collect unique tickers → deduplicate
3. Promise.all() → fetch prices for all unique tickers in parallel
4. Build Map<ticker, price>
5. For each trade:
   a. Look up price from Map (no API call)
   b. Check TP/SL/30-day expiry
   c. If should sell → call DB RPC close_sim_trade(trade_id, price, reason)
   d. If not → collect for batch price update
6. Batch update all non-sold trades' current prices in a single query
7. Batch recalculate portfolio values via calc_portfolio_value
```

Step 5d batch update implementation:

```typescript
// Batch update current prices for non-sold trades
if (priceUpdates.length > 0) {
  for (const { id, price, pnl, pnlPct } of priceUpdates) {
    await adminClient.from('sim_trades').update({
      current_price: price,
      pnl: Math.round(pnl * 100) / 100,
      pnl_percent: Math.round(pnlPct * 100) / 100,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
  }
}
```

Note: Individual updates are acceptable here since each trade has different values. The key performance win is the parallel price fetching, not the DB writes.

#### `updatePortfolioValue()` — replaced by RPC `calc_portfolio_value`

### 3.2 New API Route: `/api/sim-trading.ts`

Single Vercel serverless function with action-based routing.

```typescript
// POST /api/sim-trading?action=create
// Body: { capital: number }
// Validation: capital >= 1000
// → Creates portfolio, returns portfolio object

// POST /api/sim-trading?action=close
// Body: { tradeId: string }
// → Fetches current price via Yahoo Finance, calls close_sim_trade RPC with reason='MANUAL'
// → Returns { success, pnl, pnl_pct }

// POST /api/sim-trading?action=update-tp-sl
// Body: { tradeId: string, stopLoss?: number, takeProfit?: number }
// Validation:
//   - stopLoss must be > 0 and < entry_price (for long positions)
//   - takeProfit must be > 0 and > entry_price (for long positions)
//   - stopLoss must be < takeProfit (if both provided)
// → Updates trade, writes log entry

// GET /api/sim-trading?action=portfolio
// → Returns active portfolio with server-calculated total_value

// GET /api/sim-trading?action=trades&portfolioId=X&status=open
// → Returns trades list

// GET /api/sim-trading?action=log&portfolioId=X&limit=50
// → Returns trade log entries, ordered by created_at DESC
```

All endpoints:
- Validate auth via Supabase JWT (`req.headers.authorization`)
- Use `adminClient` for writes (bypasses RLS for server operations)
- Return structured JSON responses
- Log errors but don't expose internals

**Webhook timing note:** The current webhook already performs chart capture, AI analysis, DB writes, and Telegram notifications. Adding `await simAutoBuy()` adds ~100-200ms (single DB RPC call). The project uses Vercel Pro (60s timeout), so this is well within budget. The webhook's total time is dominated by the AI analysis call (~5-10s), not DB operations.

### 3.3 `webhook.ts` change

```diff
- // AI Sim Auto-Buy (fire-and-forget, never block webhook)
- simAutoBuy(userId, alertRecord.id, ticker, analysis)
-   .then(r => console.log(`[SIM] ${ticker}: ${r.reason}`))
-   .catch(e => console.error(`[SIM] ${ticker} error:`, e.message))
+ // AI Sim Auto-Buy (awaited to prevent silent failures)
+ try {
+   const simResult = await simAutoBuy(userId, alertRecord.id, ticker, analysis)
+   console.log(`[SIM] ${ticker}: ${simResult.reason}`)
+ } catch (e: any) {
+   console.error(`[SIM] ${ticker} error:`, e.message)
+ }
```

---

## 4. Frontend Layer

### 4.1 `useSimTrading.ts` — Refactored Hooks

**Remove:** `useSimBuy`, `useSimSell` (frontend should never directly write trades)

**Modify:**
- `useCreatePortfolio` → calls `POST /api/sim-trading?action=create`
- `useSimPortfolio` → keep Supabase direct read (acceptable for reads, RLS protects data)
- `useSimTrades` → keep as-is (reads are fine via Supabase client with RLS)

**Add:**
- `useManualClose(tradeId)` → calls `POST /api/sim-trading?action=close`
  - Optimistic update: immediately remove trade from open trades cache
  - On error: rollback cache, show error
- `useUpdateTpSl(tradeId, stopLoss, takeProfit)` → calls `POST /api/sim-trading?action=update-tp-sl`
  - Optimistic update: immediately show new TP/SL values
- `useTradeLog(portfolioId)` → calls `GET /api/sim-trading?action=log`

**Optimistic update pattern for manual close:**

```typescript
useMutation({
  mutationFn: async (tradeId: string) => {
    const res = await fetch(`/api/sim-trading?action=close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tradeId }),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
  onMutate: async (tradeId) => {
    await queryClient.cancelQueries({ queryKey: ['sim_trades'] })
    const prev = queryClient.getQueryData(['sim_trades', portfolioId, 'open'])
    queryClient.setQueryData(['sim_trades', portfolioId, 'open'], (old: SimTrade[]) =>
      old?.filter(t => t.id !== tradeId)
    )
    return { prev }
  },
  onError: (_err, _vars, context) => {
    queryClient.setQueryData(['sim_trades', portfolioId, 'open'], context?.prev)
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['sim_portfolio'] })
    queryClient.invalidateQueries({ queryKey: ['sim_trades'] })
  },
})
```

### 4.2 `SimTradingPage.tsx` — UI Additions

**Holdings tab — per-card additions:**
- "平倉" button on each HoldingCard → opens confirmation dialog → calls `useManualClose`
- TP/SL values become editable (click to edit inline) → calls `useUpdateTpSl`

**New tab: "交易日誌" (4th tab):**
- Table showing `sim_trade_log` entries
- Columns: 時間, 操作 (BUY/SELL_TP/SELL_SL/etc), 股票, 價格, 數量, 損益, 現金變化
- Action badges colored by type (BUY=primary, SELL_TP=primary, SELL_SL=tertiary, SELL_MANUAL=warning, SELL_EXPIRED=neutral)
- Filter by action type
- Pagination (50 per page)

**Loading states:**
- Replace plain text "載入中..." with Material spinner icon

---

## 5. Files to Modify

| File | Change Type | Description |
|------|------------|-------------|
| `supabase/migrations/009_sim_tables.sql` | **New** | Indexes, constraints, trade_log table, RPC functions, RLS |
| `api/_lib/sim-trader.ts` | **Rewrite** | Parallel price fetch, RPC calls for buy/sell, audit logging |
| `api/sim-trading.ts` | **New** | API route for create/close/update-tp-sl/portfolio/trades/log |
| `api/webhook.ts` | **Edit** | Change simAutoBuy from fire-and-forget to await |
| `src/hooks/useSimTrading.ts` | **Rewrite** | Remove direct writes, add API calls, optimistic updates |
| `src/pages/SimTradingPage.tsx` | **Edit** | Manual close button, TP/SL edit, trade log tab |

---

## 6. Verification Plan

### DB Layer
- Run migration on Supabase project
- Verify indexes exist: `SELECT indexname FROM pg_indexes WHERE tablename IN ('sim_portfolio', 'sim_trades', 'sim_trade_log')`
- Test `sim_auto_buy` RPC with valid and edge-case inputs (duplicate ticker, max positions, insufficient funds)
- Test `close_sim_trade` RPC manually with a test trade
- Test `calc_portfolio_value` returns correct sum; test with non-existent portfolio_id returns NULL
- Verify `sim_trade_log` entries are created for both buy and sell operations
- Verify RLS: authenticated user cannot read another user's portfolio/trades/logs

### Backend
- Send test webhook → verify simAutoBuy is awaited (check logs for timing)
- Trigger cron → verify parallel price fetch (should complete in ~2-3s for 10 trades vs ~15-20s before)
- Verify closed trades have matching trade_log entries
- Test API routes with curl: create portfolio, close trade, update TP/SL
- Test TP/SL validation: SL >= entry_price should fail, TP <= entry_price should fail

### Frontend
- Navigate to `/sim-trading` → verify portfolio loads
- Click "平倉" on a holding → confirm dialog → verify trade closes
- Edit TP/SL → verify update persists
- Check "交易日誌" tab → verify log entries display correctly
- Test optimistic updates: close trade → UI updates immediately → verify no flicker on refetch

### Edge Cases
- Close trade when market is closed (use last known price)
- Try to close already-closed trade → should return error gracefully
- Create portfolio with exactly $1,000 minimum
- Verify cash_balance never goes negative (DB constraint)
- Concurrent webhooks for same ticker → only one should buy (RPC handles locking)
- Webhook timing: verify total execution stays under 60s with await simAutoBuy
