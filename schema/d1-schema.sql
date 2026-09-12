-- ProPlum Network — Field Job Ingestion Layer (Component A)
-- D1 Schema v2 — aligned with deployed API code

CREATE TABLE IF NOT EXISTS geo_markets (
  market_id TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  suburb_neighborhood TEXT,
  state_code TEXT NOT NULL,
  postal_code TEXT,
  latitude REAL,
  longitude REAL,
  canonical_url_path TEXT
);

CREATE TABLE IF NOT EXISTS trade_services (
  code TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL,
  typical_duration_min INTEGER,
  avg_cost_range TEXT
);

CREATE TABLE IF NOT EXISTS completed_jobs (
  job_id TEXT PRIMARY KEY,
  contractor_id TEXT NOT NULL,
  market_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  work_performed_shorthand TEXT,
  editorial_status TEXT DEFAULT 'pending_enrichment',
  final_cost_homeowner REAL,
  final_cost_usd REAL,
  raw_technician_notes TEXT,
  published_case_study TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS job_media (
  media_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  media_role TEXT NOT NULL,
  r2_storage_key TEXT NOT NULL,
  optimized_webp_url TEXT,
  optimized_avif_url TEXT,
  caption TEXT,
  width INTEGER,
  height INTEGER,
  uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_audit_signals (
  audit_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  verified_by_supervisor BOOLEAN DEFAULT FALSE,
  homeowner_anonymized_hash TEXT,
  gps_coarse_zone TEXT,
  permit_number TEXT,
  code_compliance_notes TEXT,
  exif_stripped BOOLEAN DEFAULT FALSE,
  pii_masked BOOLEAN DEFAULT FALSE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Seed data
INSERT OR IGNORE INTO trade_services (code, display_name, category) VALUES
  ('water-heater-replacement', 'Water Heater Replacement', 'plumbing'),
  ('drain-cleaning', 'Drain Cleaning', 'plumbing'),
  ('pipe-burst-repair', 'Pipe Burst Repair', 'plumbing'),
  ('emergency-plumbing', 'Emergency Plumbing', 'plumbing');
