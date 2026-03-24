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
