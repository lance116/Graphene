-- New columns for Semantic Scholar integration
ALTER TABLE papers ADD COLUMN IF NOT EXISTS citation_count INTEGER DEFAULT 0;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS further_reading JSONB DEFAULT '[]';

-- Prerequisites column
ALTER TABLE papers ADD COLUMN IF NOT EXISTS prerequisites JSONB DEFAULT '[]';

-- Token usage tracking
CREATE TABLE IF NOT EXISTS token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_token_usage_user_date ON token_usage(user_id, date);
