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
