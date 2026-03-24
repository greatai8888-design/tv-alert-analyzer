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
