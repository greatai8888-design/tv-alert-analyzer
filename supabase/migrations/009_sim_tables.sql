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
