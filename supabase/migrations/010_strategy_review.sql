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
