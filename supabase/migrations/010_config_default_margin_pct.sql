-- P2-PAYMENT-FIXES FIX-E — default margin % for Step 4 wizard prefill (master config)
CREATE TABLE IF NOT EXISTS config_default_margin_pct (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate          NUMERIC(5,4) NOT NULL DEFAULT 0.12,
  is_active     BOOLEAN DEFAULT true,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

INSERT INTO config_default_margin_pct (rate)
SELECT 0.12
WHERE NOT EXISTS (SELECT 1 FROM config_default_margin_pct LIMIT 1);
