-- Paper authorship claims (verified users only)
CREATE TABLE IF NOT EXISTS paper_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, paper_id)
);

CREATE INDEX IF NOT EXISTS idx_paper_claims_user ON paper_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_paper_claims_paper ON paper_claims(paper_id);
